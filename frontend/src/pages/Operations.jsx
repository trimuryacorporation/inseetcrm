import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  LogIn,
  LogOut,
  CalendarDays,
  Download,
  Printer,
  BarChart3,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  StatusBadge,
} from "../components/ui";
export function Attendance() {
  const [items, setItems] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    try {
      setItems((await api.get("/attendance")).data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function action(type) {
    setBusy(true);
    try {
      await api.post("/attendance/" + type);
      toast.success(
        type === "check-in"
          ? "Checked in. Have a productive day!"
          : "Checked out. See you next time.",
      );
      load();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE EVERY DAY COUNT</div>
          <h1>
            Attendance<span className="heading-dot">.</span>
          </h1>
          <p>
            Check in, check out, and track your working hours. Work days use
            India time.
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => action("check-out")}
          >
            <LogOut size={16} />
            Check out
          </button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => action("check-in")}
          >
            <LogIn size={16} />
            Check in
          </button>
        </div>
      </div>
      <div className="module-subnav">
        <Link to="/attendance">Attendance</Link>
        <Link to="/leaves">Leave requests</Link>
      </div>
      <section className="panel">
        {error ? (
          <ErrorState error={error} retry={load} />
        ) : !items ? (
          <LoadingSkeleton />
        ) : items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>EMPLOYEE</th>
                  <th>DAY (IST)</th>
                  <th>CHECK IN</th>
                  <th>CHECK OUT</th>
                  <th>WORKING TIME</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a._id}>
                    <td>{a.user?.name}</td>
                    <td>{a.day}</td>
                    <td>{new Date(a.checkIn).toLocaleTimeString()}</td>
                    <td>
                      {a.checkOut
                        ? new Date(a.checkOut).toLocaleTimeString()
                        : "—"}
                    </td>
                    <td>
                      {Math.floor(a.minutes / 60)}h {a.minutes % 60}m
                    </td>
                    <td>
                      <StatusBadge>
                        {a.checkOut ? "Completed" : "Active"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="A fresh day, a fresh start"
            description="Check in to begin recording your work day."
          />
        )}
      </section>
    </>
  );
}
export function Reports() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + "01"),
    [to, setTo] = useState(today),
    [data, setData] = useState(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      setData((await api.get("/reports", { params: { from, to } })).data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  function download() {
    const rows = [
      ["Metric", "Count"],
      ...data.records.map((r) => [r.name, r.count]),
      ...(data.finance
        ? [
            ["Invoiced (paise)", data.finance.invoicedPaise],
            ["Collected (paise)", data.finance.collectedPaise],
          ]
        : []),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.join(",")).join("\r\n")], {
        type: "text/csv",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "inseet-report-" + from + "-" + to + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">BETTER INSIGHTS. BETTER DECISIONS.</div>
          <h1>
            Reports & analytics<span className="heading-dot">.</span>
          </h1>
          <p>Live activity counts for your selected date range.</p>
        </div>
        <div className="page-actions no-print">
          <button className="btn secondary" disabled={!data} onClick={download}>
            <Download size={16} />
            CSV
          </button>
          <button
            className="btn primary"
            disabled={!data}
            onClick={() => window.print()}
          >
            <Printer size={16} />
            Print / PDF
          </button>
        </div>
      </div>
      <form
        className="report-filters no-print"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <label>
          From{" "}
          <input
            aria-label="Report start date"
            type="date"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To{" "}
          <input
            aria-label="Report end date"
            type="date"
            required
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="btn primary">Apply date range</button>
      </form>
      {error ? (
        <ErrorState error={error} retry={load} />
      ) : !data ? (
        <LoadingSkeleton />
      ) : (
        <>
          <p className="report-period">
            Reporting period: {from} — {to}
          </p>
          <div className="stat-grid report-grid">
            {data.records.map((r) => (
              <div className="stat-card" key={r.name}>
                <div className="stat-top">
                  {r.name}
                  <BarChart3 size={18} />
                </div>
                <strong className="stat-value">{r.count}</strong>
                <span className="stat-caption">Created in selected period</span>
              </div>
            ))}
          </div>
          {data.finance && (
            <div className="panel p-6">
              <h2 className="font-semibold mb-4">Financial summary</h2>
              <p>
                Invoiced: ₹
                {(data.finance.invoicedPaise / 100).toLocaleString("en-IN")}
              </p>
              <p className="mt-3">
                Collected against these invoices: ₹
                {(data.finance.collectedPaise / 100).toLocaleString("en-IN")}
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
