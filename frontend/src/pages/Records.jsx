import ClientFields, { fixedFeeToPaise } from "../features/ClientFields";
import DataTools from "../components/DataTools";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import {
  Plus,
  Download,
  Pencil,
  Trash2,
  Building2,
  BriefcaseBusiness,
  ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import { useAuth } from "../store/auth";
import {
  LoadingSkeleton,
  EmptyState,
  ErrorState,
  StatusBadge,
  SearchInput,
  FormModal,
  Field,
  Pagination,
} from "../components/ui";
const clientFields = [
  ["companyName", "Company name", true],
  ["industry", "Industry"],
  ["contactPerson", "Contact person"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["website", "Website"],
  ["city", "City"],
  ["state", "State"],
  ["gstin", "GSTIN"],
  ["paymentTerms", "Payment terms"],
  ["placementFee", "Placement fee (%)"],
];
const jobFields = [
  ["title", "Job title", true],
  ["location", "Location"],
  ["department", "Department"],
  ["openings", "Openings", true],
  ["salary", "Salary / CTC"],
  ["experience", "Experience"],
];
export default function Records({ type }) {
  const clients = type === "clients",
    title = clients ? "Clients" : "Jobs",
    single = clients ? "client" : "job";
  const user = useAuth((s) => s.user);
  const canWrite = [
    "Super Admin",
    "Admin",
    "HR Manager",
    "Team Leader",
    "Sales Manager",
    "BDE",
    "Account Manager",
    ...(!clients ? ["Recruiter"] : []),
  ].includes(user.role);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || ""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(params.get("create") === "1" ? {} : null),
    [deleting, setDeleting] = useState(null),
    [options, setOptions] = useState([]),
    [busy, setBusy] = useState(false);
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
      setData(
        (await api.get("/" + type, { params: { q, status, page } })).data,
      );
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [type, q, status, page]);
  useEffect(() => {
    if (editing) {
      reset(editing);
      if (!clients)
        api
          .get("/clients?limit=100")
          .then((r) => setOptions(r.data.items))
          .catch((e) => toast.error(message(e)));
    }
  }, [editing]);
  useEffect(() => {
    setQ(params.get("q") || "");
  }, [params.get("q")]);
  async function save(values) {
    try {
      delete values._id;
      if (clients) {
        if (values.feeType === "fixed" && values.paymentTerms) {
          values.fixedFeePaise = fixedFeeToPaise(values.fixedFee);
          delete values.placementFee;
        } else {
          delete values.fixedFeePaise;
          if (values.placementFee === "" || values.placementFee == null)
            delete values.placementFee;
        }
        delete values.fixedFee;
      }
      if (!clients) values.openings = Number(values.openings);
      if (editing._id) await api.patch("/" + type + "/" + editing._id, values);
      else await api.post("/" + type, values);
      toast.success(single + " saved");
      close();
      await load();
    } catch (e) {
      toast.error(
        e.response ? message(e) : e.message || "Could not save record",
      );
    }
  }
  function close() {
    setEditing(null);
    if (params.has("create")) {
      params.delete("create");
      setParams(params);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api.delete("/" + type + "/" + deleting._id);
      toast.success("Record archived");
      setDeleting(null);
      await load();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportCsv() {
    try {
      let rows = [],
        p = 1,
        total = 1;
      while (p <= total) {
        const r = await api.get("/" + type, {
          params: { q, status, page: p, limit: 100 },
        });
        rows.push(...r.data.items);
        total = r.data.pages;
        p++;
      }
      const keys = clients
        ? [
            "companyName",
            "industry",
            "email",
            "phone",
            "state",
            "city",
            "gstin",
            "paymentTerms",
            "feeType",
            "placementFee",
            "fixedFeePaise",
            "status",
          ]
        : ["title", "location", "openings", "salary", "priority", "status"];
      const cell = (value) =>
        '"' +
        String(value ?? "")
          .replace(/^[=+@\t\r-]/, "'$&")
          .replaceAll('"', '""') +
        '"';
      const blob = new Blob(
        [
          "﻿" +
            [
              keys.join(","),
              ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
            ].join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8;" },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "inseet-" + type + ".csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(message(e));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {clients
              ? "RELATIONSHIPS THAT CREATE OPPORTUNITY"
              : "THE NEXT CHAPTER STARTS HERE"}
          </div>
          <h1>
            {title}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {clients
              ? "Build and manage your client relationships in one place."
              : "Organize requirements, assign talent, and keep hiring moving."}
          </p>
        </div>
        <div className="page-actions">
          {!clients &&
            ["Super Admin", "Admin", "HR Manager", "Team Leader"].includes(
              user.role,
            ) && (
              <Link to="/assignments" className="btn secondary">
                Assignments
              </Link>
            )}
          <DataTools resource={type} />
          <button className="btn secondary" onClick={exportCsv}>
            <Download size={16} />
            Export CSV
          </button>
          {canWrite && (
            <button className="btn primary" onClick={() => setEditing({})}>
              <Plus size={17} />
              Add {single}
            </button>
          )}
        </div>
      </div>
      <div className="panel">
        <div className="records-toolbar">
          <div className="record-tab">
            All {type} <span className="count-pill">{data?.total || 0}</span>
          </div>
          <div className="filter-controls">
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
              placeholder={"Search " + type + "…"}
            />
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {(clients
                ? ["Active", "Inactive", "Prospect"]
                : ["Open", "On Hold", "Closed"]
              ).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
        {error ? (
          <ErrorState error={error} retry={load} />
        ) : !data ? (
          <LoadingSkeleton />
        ) : data.items.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{clients ? "COMPANY" : "JOB REQUIREMENT"}</th>
                    <th>{clients ? "CONTACT" : "CLIENT"}</th>
                    <th>LOCATION</th>
                    <th>{clients ? "INDUSTRY" : "OPENINGS"}</th>
                    <th>STATUS</th>
                    {canWrite && <th>ACTIONS</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r._id}>
                      <td>
                        <div className="job-title">
                          <span
                            className={"job-symbol " + (clients ? "blue" : "")}
                          >
                            {clients ? (
                              <Building2 size={18} />
                            ) : (
                              <BriefcaseBusiness size={18} />
                            )}
                          </span>
                          <div>
                            <strong>{clients ? r.companyName : r.title}</strong>
                            <small>
                              {clients ? r.website : r.department || "General"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {clients
                          ? r.contactPerson || "—"
                          : r.client?.companyName || "—"}
                        {clients && <small>{r.email}</small>}
                      </td>
                      <td>{clients ? r.city || "—" : r.location || "—"}</td>
                      <td>{clients ? r.industry || "—" : r.openings}</td>
                      <td>
                        <StatusBadge>{r.status}</StatusBadge>
                      </td>
                      {canWrite && (
                        <td>
                          <div className="flex gap-1">
                            <button
                              className="icon-btn"
                              aria-label={"Edit " + (r.companyName || r.title)}
                              onClick={() =>
                                setEditing({
                                  ...Object.fromEntries(
                                    (clients ? clientFields : jobFields).map(
                                      ([k]) => [k, r[k] ?? ""],
                                    ),
                                  ),
                                  status: r.status,
                                  ...(clients
                                    ? {
                                        feeType: r.feeType || "percentage",
                                        fixedFeePaise: r.fixedFeePaise,
                                        fixedFee:
                                          r.fixedFeePaise == null
                                            ? ""
                                            : (r.fixedFeePaise / 100).toFixed(
                                                2,
                                              ),
                                      }
                                    : {}),
                                  ...(!clients
                                    ? {
                                        client: r.client?._id || r.client,
                                        priority: r.priority,
                                        description: r.description || "",
                                      }
                                    : {}),
                                  _id: r._id,
                                })
                              }
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-btn danger"
                              aria-label={
                                "Archive " + (r.companyName || r.title)
                              }
                              onClick={() => setDeleting(r)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pages={data.pages}
              total={data.total}
              onChange={setPage}
            />
          </>
        ) : (
          <EmptyState
            title={
              q || status
                ? "No matching " + type
                : "Your first " +
                  single +
                  " is the beginning of something great"
            }
            description={
              q || status
                ? "Try another search or status filter."
                : "Add your first " +
                  single +
                  " to start building your recruitment workspace."
            }
            action={
              canWrite && (
                <button className="btn primary" onClick={() => setEditing({})}>
                  <Plus size={16} />
                  Add {single}
                </button>
              )
            }
          />
        )}
      </div>
      {editing && (
        <FormModal
          title={(editing._id ? "Edit " : "Add ") + single}
          onClose={close}
        >
          <form onSubmit={handleSubmit(save)}>
            <div className="form-grid">
              {!clients && (
                <Field label="Client *">
                  <select required {...register("client")}>
                    <option value="">Select a client</option>
                    {options.map((c) => (
                      <option value={c._id} key={c._id}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {clients ? (
                <ClientFields
                  register={register}
                  watch={watch}
                  setValue={setValue}
                />
              ) : (
                <>
                  {jobFields.map(([key, label, required]) => (
                    <Field key={key} label={label + (required ? " *" : "")}>
                      <input
                        required={required}
                        maxLength={300}
                        type={
                          key === "email"
                            ? "email"
                            : key === "website"
                              ? "url"
                              : ["openings", "placementFee"].includes(key)
                                ? "number"
                                : "text"
                        }
                        min={key === "openings" ? 1 : 0}
                        step={key === "placementFee" ? "0.01" : undefined}
                        defaultValue={key === "openings" ? 1 : undefined}
                        {...register(key)}
                      />
                    </Field>
                  ))}
                </>
              )}
              <Field label="Status">
                <select {...register("status")}>
                  {(clients
                    ? ["Active", "Inactive", "Prospect"]
                    : ["Open", "On Hold", "Closed"]
                  ).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              {!clients && (
                <>
                  <Field label="Priority">
                    <select {...register("priority")}>
                      <option>Normal</option>
                      <option>High</option>
                      <option>Urgent</option>
                    </select>
                  </Field>
                  <Field label="Job description">
                    <textarea
                      rows={4}
                      maxLength={20000}
                      {...register("description")}
                    />
                  </Field>
                </>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={close}>
                Cancel
              </button>
              <button className="btn primary" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save " + single}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </FormModal>
      )}
      {deleting && (
        <FormModal
          title={"Archive " + single + "?"}
          onClose={() => setDeleting(null)}
        >
          <div className="p-6">
            <p>
              This will remove {deleting.companyName || deleting.title} from
              active records. Its audit history will be retained.
            </p>
            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button
                className="btn danger-solid"
                onClick={remove}
                disabled={busy}
              >
                {busy ? "Archiving…" : "Archive record"}
              </button>
            </div>
          </div>
        </FormModal>
      )}
    </>
  );
}
