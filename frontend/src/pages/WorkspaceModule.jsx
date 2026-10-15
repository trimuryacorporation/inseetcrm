import DepartmentField from "../features/DepartmentField";
import PlacementFields from "../features/PlacementFields";
import { rupeesToPaise, isPlacementMoney } from "../utils/money";
import GstinField from "../features/GstinField";
import { Suggestions } from "../features/CandidateFields";
import { percentToBasisPoints } from "../utils/percentage";
import DataTools from "../components/DataTools";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  ArrowRight,
  Check,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import { useAuth } from "../store/auth";
import {
  LoadingSkeleton,
  EmptyState,
  ErrorState,
  FormModal,
  Field,
  Pagination,
  SearchInput,
  StatusBadge,
} from "../components/ui";
export default function WorkspaceModule({ module }) {
  const user = useAuth((s) => s.user);
  const [definition, setDefinition] = useState(null),
    [data, setData] = useState(null),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(null),
    [deleting, setDeleting] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting, errors },
  } = useForm();
  async function load() {
    setError("");
    try {
      const defs = (await api.get("/workspace/modules")).data;
      const def = defs[module];
      if (!def) {
        setError("Your role does not have access to this module.");
        return;
      }
      setDefinition(def);
      setData((await api.get("/" + module, { params: { q, page } })).data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [module, q, page]);
  useEffect(() => {
    if (editing && definition)
      reset(
        Object.assign(
          Object.fromEntries(
            definition.fields.map((f) => [
              f.key,
              module === "placements" && isPlacementMoney(f.key)
                ? editing[f.key] == null
                  ? ""
                  : (editing[f.key] / 100).toFixed(2)
                : f.key === "commissionBasisPoints"
                  ? editing[f.key] == null
                    ? ""
                    : (editing[f.key] / 100).toFixed(2)
                  : f.type === "date"
                    ? editing[f.key]?.slice(0, 10) || ""
                    : (editing[f.key] ?? (f.options?.[0] || "")),
            ]),
          ),
          module === "placements"
            ? {
                candidate: editing.candidate || "",
                client: editing.client || "",
                job: editing.job || "",
              }
            : {},
        ),
      );
  }, [editing]);
  async function save(values) {
    try {
      const body = Object.fromEntries(
        definition.fields
          .filter(
            (f) =>
              f.key === "gstin" ||
              f.key === "commissionBasisPoints" ||
              f.required ||
              values[f.key] !== "",
          )
          .map((f) => [
            f.key,
            module === "placements" && isPlacementMoney(f.key)
              ? rupeesToPaise(values[f.key])
              : f.key === "commissionBasisPoints"
                ? values[f.key] === ""
                  ? 0
                  : percentToBasisPoints(values[f.key])
                : f.type === "number"
                  ? Number(values[f.key])
                  : values[f.key],
          ]),
      );
      if (module === "placements")
        Object.assign(body, {
          candidate: values.candidate,
          client: values.client,
          job: values.job,
        });
      if (editing._id) await api.patch("/" + module + "/" + editing._id, body);
      else await api.post("/" + module, body);
      toast.success("Record saved");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response ? message(e) : e.message);
    }
  }
  async function remove() {
    try {
      await api.delete("/" + module + "/" + deleting._id);
      toast.success("Record archived");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function approve(row, status) {
    try {
      await api.patch("/leaves/" + row._id + "/approval", { status });
      toast.success("Leave " + status.toLowerCase());
      load();
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function exportCsv() {
    try {
      let rows = [],
        p = 1,
        pages = 1;
      while (p <= pages) {
        const r = (
          await api.get("/" + module, { params: { q, page: p++, limit: 100 } })
        ).data;
        rows.push(...r.items);
        pages = r.pages;
      }
      const keys = definition.fields.map((f) => f.key),
        cell = (v) =>
          '"' +
          String(v ?? "")
            .replace(/^[=+@\t\r-]/, "'$&")
            .replaceAll('"', '""') +
          '"';
      const url = URL.createObjectURL(
        new Blob(
          [
            "\ufeff" +
              [
                keys
                  .map((k) =>
                    module === "placements" && isPlacementMoney(k)
                      ? k.replace("Paise", "INR")
                      : k === "commissionBasisPoints"
                        ? "commissionPercent"
                        : k,
                  )
                  .join(","),
                ...rows.map((r) =>
                  keys
                    .map((k) =>
                      cell(
                        (k === "commissionBasisPoints" ||
                          (module === "placements" && isPlacementMoney(k))) &&
                          r[k] != null
                          ? (r[k] / 100).toFixed(2)
                          : r[k],
                      ),
                    )
                    .join(","),
                ),
              ].join("\r\n"),
          ],
          { type: "text/csv" },
        ),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "inseet-" + module + ".csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(message(e));
    }
  }
  if (error) return <ErrorState error={error} retry={load} />;
  if (!definition || !data) return <LoadingSkeleton />;
  const shown = definition.fields
    .filter((f) => f.type !== "textarea")
    .slice(0, module === "placements" ? 8 : module === "vendors" ? 7 : 6);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE INSEET WORKSPACE</div>
          <h1>
            {definition.title}
            <span className="heading-dot">.</span>
          </h1>
          <p>{definition.description}</p>
        </div>
        <div className="page-actions">
          <DataTools resource={module} />
          <button className="btn secondary" onClick={exportCsv}>
            <Download size={16} />
            Export CSV
          </button>
          {definition.canWrite && (
            <button className="btn primary" onClick={() => setEditing({})}>
              <Plus size={16} />
              {module === "departments" ? "Add department" : "Add record"}
            </button>
          )}
        </div>
      </div>
      <div className="module-subnav">
        {module === "leads" && (
          <>
            <a href="/sales">Leads</a>
            <a href="/deals">Deals</a>
          </>
        )}
        {module === "placements" && (
          <>
            <a href="/placements">Joinings</a>
            <a href="/offers">Offers</a>
          </>
        )}
        {["teams", "departments"].includes(module) && (
          <>
            <a href="/people">Employees</a>
            <a href="/teams">Teams</a>
            <a href="/departments">Departments</a>
            <a href="/attendance">Attendance</a>
            <a href="/leaves">Leave requests</a>
            <a href="/branches">Branches</a>
          </>
        )}
      </div>
      <section className="panel">
        <div className="records-toolbar">
          <span className="record-tab">
            All records <span className="count-pill">{data.total}</span>
          </span>
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
        </div>
        {data.items.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {shown.map((f) => (
                      <th key={f.key}>{f.label.toUpperCase()}</th>
                    ))}
                    {module === "leaves" && <th>APPROVAL</th>}
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row._id}>
                      {shown.map((f, i) => (
                        <td key={f.key}>
                          {module === "placements" &&
                          isPlacementMoney(f.key) ? (
                            row[f.key] == null ? (
                              "-"
                            ) : (
                              new Intl.NumberFormat("en-IN", {
                                style: "currency",
                                currency: "INR",
                              }).format(row[f.key] / 100)
                            )
                          ) : f.key === "commissionBasisPoints" ? (
                            row[f.key] == null ? (
                              "-"
                            ) : (
                              (row[f.key] / 100).toFixed(2) + "%"
                            )
                          ) : f.type === "date" ? (
                            row[f.key]?.slice(0, 10) || "—"
                          ) : f.type === "select" ? (
                            <StatusBadge>{row[f.key]}</StatusBadge>
                          ) : i === 0 ? (
                            <strong>{row[f.key] || "—"}</strong>
                          ) : (
                            (row[f.key] ?? "—")
                          )}
                        </td>
                      ))}
                      {module === "leaves" && (
                        <td>
                          <StatusBadge>{row.approvalStatus}</StatusBadge>
                        </td>
                      )}
                      <td>
                        <div className="flex gap-1">
                          {definition.canWrite && (
                            <>
                              <button
                                className="icon-btn"
                                aria-label="Edit record"
                                onClick={() => setEditing(row)}
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                className="icon-btn danger"
                                aria-label="Archive record"
                                onClick={() => setDeleting(row)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                          {module === "leaves" &&
                            [
                              "Super Admin",
                              "Admin",
                              "HR Manager",
                              "Team Leader",
                            ].includes(user.role) &&
                            row.approvalStatus === "Pending" &&
                            row.owner !== user.id && (
                              <>
                                <button
                                  className="icon-btn"
                                  aria-label="Approve leave"
                                  onClick={() => approve(row, "Approved")}
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  className="icon-btn danger"
                                  aria-label="Reject leave"
                                  onClick={() => approve(row, "Rejected")}
                                >
                                  <X size={16} />
                                </button>
                              </>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              total={data.total}
              page={page}
              pages={data.pages}
              onChange={setPage}
            />
          </>
        ) : (
          <EmptyState
            title="Make room for your next opportunity"
            description="Add your first record to get this part of your workspace moving."
            action={
              definition.canWrite && (
                <button className="btn primary" onClick={() => setEditing({})}>
                  <Plus size={16} />
                  {module === "departments" ? "Add department" : "Add record"}
                </button>
              )
            }
          />
        )}
      </section>
      {editing && (
        <FormModal
          title={
            module === "departments"
              ? editing._id
                ? "Edit department"
                : "Add department"
              : editing._id
                ? "Edit record"
                : "Add record"
          }
          onClose={() => setEditing(null)}
        >
          <form onSubmit={handleSubmit(save)}>
            <div className="form-grid">
              {module === "placements" && (
                <PlacementFields
                  register={register}
                  watch={watch}
                  setValue={setValue}
                  errors={errors}
                />
              )}
              {definition.fields
                .filter(
                  (f) =>
                    module !== "placements" ||
                    !["candidateName", "companyName", "jobTitle"].includes(
                      f.key,
                    ),
                )
                .map((f) =>
                  f.key === "department" ? (
                    <DepartmentField
                      key={f.key}
                      register={register}
                      watch={watch}
                      setValue={setValue}
                    />
                  ) : f.key === "gstin" ? (
                    <GstinField
                      key={f.key}
                      register={register}
                      watch={watch}
                      setValue={setValue}
                    />
                  ) : f.key === "city" ? (
                    <Suggestions
                      key={f.key}
                      field="city"
                      label="City"
                      value={watch("city")}
                      setValue={setValue}
                      endpoint="/validation/locations"
                    />
                  ) : (
                    <Field
                      label={f.label + (f.required ? " *" : "")}
                      key={f.key}
                    >
                      {f.options ? (
                        <select required={f.required} {...register(f.key)}>
                          {f.options.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      ) : f.type === "textarea" ? (
                        <textarea
                          rows={4}
                          required={f.required}
                          maxLength={10000}
                          {...register(f.key)}
                        />
                      ) : (
                        <input
                          required={f.required}
                          type={f.type}
                          min={f.type === "number" ? 0 : undefined}
                          max={
                            f.key === "commissionBasisPoints" ? 100 : undefined
                          }
                          step={
                            f.key === "commissionBasisPoints" ||
                            (module === "placements" && isPlacementMoney(f.key))
                              ? 0.01
                              : f.type === "number"
                                ? 1
                                : undefined
                          }
                          {...register(f.key)}
                        />
                      )}
                    </Field>
                  ),
                )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving..."
                  : module === "departments"
                    ? "Save department"
                    : "Save record"}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </FormModal>
      )}
      {deleting && (
        <FormModal
          title="Archive this record?"
          onClose={() => setDeleting(null)}
        >
          <div className="p-6">
            <p>
              The record will be removed from active views and retained in the
              audit trail.
            </p>
            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button className="btn danger-solid" onClick={remove}>
                Archive record
              </button>
            </div>
          </div>
        </FormModal>
      )}
    </>
  );
}
