import GstinField from "../features/GstinField";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Plus,
  Receipt,
  Wallet,
  Printer,
  IndianRupee,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import {
  FormModal,
  Field,
  EmptyState,
  ErrorState,
  StatusBadge,
  LoadingSkeleton,
} from "../components/ui";
const money = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    n / 100,
  );
export default function Finance() {
  const [invoices, setInvoices] = useState(null),
    [payments, setPayments] = useState([]),
    [error, setError] = useState(""),
    [mode, setMode] = useState(null),
    [selected, setSelected] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm();
  async function load() {
    setError("");
    try {
      const [i, p] = await Promise.all([
        api.get("/invoices"),
        api.get("/payments"),
      ]);
      setInvoices(i.data);
      setPayments(p.data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  function open(value) {
    reset({
      gstPercent: 18,
      dueAt: new Date().toISOString().slice(0, 10),
      paidAt: new Date().toISOString().slice(0, 10),
    });
    setMode(value);
  }
  async function save(values) {
    try {
      if (mode === "invoice") {
        const subtotalPaise = Math.round(Number(values.subtotal) * 100),
          gstBasisPoints = Math.round(Number(values.gstPercent) * 100);
        await api.post("/invoices", {
          companyName: values.companyName,
          gstin: values.gstin,
          description: values.description,
          subtotalPaise,
          gstBasisPoints,
          dueAt: values.dueAt,
        });
      } else
        await api.post("/payments", {
          invoice: values.invoice,
          amountPaise: Math.round(Number(values.amount) * 100),
          reference: values.reference,
          paidAt: values.paidAt,
        });
      toast.success(
        mode === "invoice" ? "Invoice created" : "Payment recorded",
      );
      setMode(null);
      load();
    } catch (e) {
      toast.error(message(e));
    }
  }
  if (error) return <ErrorState error={error} retry={load} />;
  if (!invoices) return <LoadingSkeleton />;
  const total = invoices.reduce((a, i) => a + i.totalPaise, 0),
    paid = invoices.reduce((a, i) => a + i.paidPaise, 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CLARITY IN EVERY TRANSACTION</div>
          <h1>
            Finance & billing<span className="heading-dot">.</span>
          </h1>
          <p>Manage invoices, collections, and outstanding balances.</p>
        </div>
        <div className="page-actions">
          <button className="btn secondary" onClick={() => open("payment")}>
            <Wallet size={16} />
            Record payment
          </button>
          <button className="btn primary" onClick={() => open("invoice")}>
            <Plus size={16} />
            Create invoice
          </button>
        </div>
      </div>
      <div className="module-subnav">
        <Link to="/finance">Invoices & payments</Link>
        <Link to="/expenses">Expenses</Link>
        <Link to="/incentives">Incentives</Link>
      </div>
      <div className="stat-grid finance-grid">
        {[
          ["Invoiced", total],
          ["Collected", paid],
          ["Outstanding", total - paid],
          ["Invoice count", invoices.length],
        ].map(([label, n], i) => (
          <div className="stat-card" key={label}>
            <div className="stat-top">
              {label}
              <span className="stat-icon violet">
                <IndianRupee size={18} />
              </span>
            </div>
            <strong className="stat-value finance-stat">
              {i === 3 ? n : money(n)}
            </strong>
            <div className="stat-caption">Latest 100 invoices</div>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Client invoices</h2>
            <p>Amounts include the configured GST rate.</p>
          </div>
        </div>
        {invoices.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>INVOICE / CLIENT</th>
                  <th>DUE DATE</th>
                  <th>AMOUNT</th>
                  <th>PAID</th>
                  <th>STATUS</th>
                  <th>VIEW / PRINT</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i._id}>
                    <td>
                      <strong>{i.number}</strong>
                      <small>{i.companyName}</small>
                    </td>
                    <td>{i.dueAt.slice(0, 10)}</td>
                    <td>{money(i.totalPaise)}</td>
                    <td>{money(i.paidPaise)}</td>
                    <td>
                      <StatusBadge>{i.status}</StatusBadge>
                    </td>
                    <td>
                      <button
                        className="icon-btn"
                        aria-label="View invoice"
                        onClick={() => setSelected(i)}
                      >
                        <Receipt size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Your first invoice, beautifully organized"
            description="Create a client invoice to start tracking your collections."
          />
        )}
      </section>
      <section className="panel mt-6">
        <div className="panel-heading">
          <h2>Payment ledger</h2>
        </div>
        {payments.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>REFERENCE</th>
                  <th>INVOICE</th>
                  <th>PAYMENT DATE</th>
                  <th>AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p._id}>
                    <td>{p.reference}</td>
                    <td>
                      {p.invoice?.number}
                      <small>{p.invoice?.companyName}</small>
                    </td>
                    <td>{p.paidAt.slice(0, 10)}</td>
                    <td>{money(p.amountPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No payments recorded yet"
            description="Record a collection against an outstanding invoice."
          />
        )}
      </section>
      {mode && (
        <FormModal
          title={mode === "invoice" ? "Create invoice" : "Record payment"}
          onClose={() => setMode(null)}
        >
          <form className="p-6" onSubmit={handleSubmit(save)}>
            {mode === "invoice" ? (
              <>
                <Field label="Client company">
                  <input required {...register("companyName")} />
                </Field>
                <GstinField
                  label="Client GSTIN"
                  register={register}
                  watch={watch}
                  setValue={setValue}
                />
                <Field label="Description of services">
                  <textarea required rows={3} {...register("description")} />
                </Field>
                <div className="form-grid compact">
                  <Field label="Subtotal (₹)">
                    <input
                      type="number"
                      required
                      min={0.01}
                      step="0.01"
                      {...register("subtotal")}
                    />
                  </Field>
                  <Field label="GST (%)">
                    <input
                      type="number"
                      required
                      min={0}
                      max={100}
                      step="0.01"
                      {...register("gstPercent")}
                    />
                  </Field>
                </div>
                <Field label="Due date">
                  <input type="date" required {...register("dueAt")} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Outstanding invoice">
                  <select required {...register("invoice")}>
                    <option value="">Choose invoice</option>
                    {invoices
                      .filter((i) => i.status !== "Paid")
                      .map((i) => (
                        <option key={i._id} value={i._id}>
                          {i.number} · {money(i.totalPaise - i.paidPaise)}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Payment amount (₹)">
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    {...register("amount")}
                  />
                </Field>
                <Field label="Unique bank / payment reference">
                  <input required {...register("reference")} />
                </Field>
                <Field label="Payment date">
                  <input type="date" required {...register("paidAt")} />
                </Field>
              </>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setMode(null)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save"}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </FormModal>
      )}
      {selected && (
        <FormModal title={selected.number} onClose={() => setSelected(null)}>
          <div className="invoice-document">
            <div className="invoice-brand">
              INSEET<span>.</span>
            </div>
            <p>Trimurya Corporation Private Limited</p>
            <h2>SERVICE INVOICE</h2>
            <div className="invoice-details">
              <div>
                <small>BILL TO</small>
                <h3>{selected.companyName}</h3>
                <p>GSTIN: {selected.gstin || "Not provided"}</p>
              </div>
              <div>
                <strong>{selected.number}</strong>
                <p>Due: {selected.dueAt.slice(0, 10)}</p>
              </div>
            </div>
            <p className="invoice-description">{selected.description}</p>
            <dl>
              <dt>Subtotal</dt>
              <dd>{money(selected.subtotalPaise)}</dd>
              <dt>GST ({selected.gstBasisPoints / 100}%)</dt>
              <dd>{money(selected.taxPaise)}</dd>
              <dt>Total</dt>
              <dd>
                <strong>{money(selected.totalPaise)}</strong>
              </dd>
              <dt>Paid</dt>
              <dd>{money(selected.paidPaise)}</dd>
              <dt>Outstanding</dt>
              <dd>{money(selected.totalPaise - selected.paidPaise)}</dd>
            </dl>
            <p className="form-note">
              Supplier GST registration, address, place of supply, and tax split
              must be configured before using this document as a compliant GST
              tax invoice.
            </p>
            <button
              className="btn primary no-print"
              onClick={() => window.print()}
            >
              <Printer size={16} />
              Print / Save PDF
            </button>
          </div>
        </FormModal>
      )}
    </>
  );
}
