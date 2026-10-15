import CandidateFields from "../features/CandidateFields";
import DataTools from "../components/DataTools";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Plus,
  Download,
  Pencil,
  Trash2,
  UserRound,
  ArrowRight,
  Phone,
  MapPin,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import {
  EmptyState,
  ErrorState,
  FormModal,
  Field,
  Pagination,
  SearchInput,
  LoadingSkeleton,
} from "../components/ui";
const fields = [
  ["fullName", "Full name", true],
  ["phone", "Phone", true],
  ["email", "Email"],
  ["currentCity", "Current city"],
  ["preferredLocation", "Preferred location"],
  ["qualification", "Qualification"],
  ["experience", "Experience"],
  ["currentSalary", "Current salary"],
  ["expectedSalary", "Expected salary"],
  ["noticePeriod", "Notice period"],
  ["source", "Candidate source"],
];
export default function Candidates() {
  const [data, setData] = useState(null),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState(null),
    [deleting, setDeleting] = useState(null),
    [error, setError] = useState("");
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
      setData((await api.get("/candidates", { params: { q, page } })).data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, page]);
  useEffect(() => {
    if (editing)
      reset({
        ...Object.fromEntries(fields.map(([k]) => [k, editing[k] || ""])),
        notes: editing.notes || "",
        skills: editing.skills || [],
        consent: editing.consent || false,
      });
  }, [editing]);
  async function save(values) {
    try {
      const body = {
        ...values,
        skills: values.skills || [],
      };
      if (editing._id) await api.patch("/candidates/" + editing._id, body);
      else await api.post("/candidates", body);
      toast.success("Candidate saved");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function remove() {
    try {
      await api.delete("/candidates/" + deleting._id);
      toast.success("Candidate archived");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function exportCsv() {
    try {
      const keys = [
        "fullName",
        "phone",
        "email",
        "currentCity",
        "experience",
        "source",
      ];
      let rows = [],
        p = 1,
        pages = 1;
      while (p <= pages) {
        const r = (
          await api.get("/candidates", { params: { q, page: p++, limit: 100 } })
        ).data;
        rows.push(...r.items);
        pages = r.pages;
      }
      const cell = (v) =>
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
                keys.join(","),
                ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
              ].join("\r\n"),
          ],
          { type: "text/csv" },
        ),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "inseet-candidates.csv";
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
            PEOPLE AT THE HEART OF EVERY OPPORTUNITY
          </div>
          <h1>
            Candidates<span className="heading-dot">.</span>
          </h1>
          <p>Your talent network. Every conversation, every possibility.</p>
        </div>
        <div className="page-actions">
          <DataTools resource="candidates" onImported={load} />
          <button className="btn secondary" onClick={exportCsv}>
            <Download size={16} />
            Export CSV
          </button>
          <button className="btn primary" onClick={() => setEditing({})}>
            <Plus size={16} />
            Add candidate
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="records-toolbar">
          <div className="record-tab">
            Talent database{" "}
            <span className="count-pill">{data?.total || 0}</span>
          </div>
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Name, skill, location or phone…"
          />
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
                    <th>CANDIDATE</th>
                    <th>CONTACT</th>
                    <th>LOCATION</th>
                    <th>EXPERIENCE</th>
                    <th>SKILLS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr key={c._id}>
                      <td>
                        <div className="job-title">
                          <span className="avatar">
                            {c.fullName.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <strong>{c.fullName}</strong>
                            <small>
                              {c.qualification || "Qualification not set"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {c.phone}
                        <small>{c.email}</small>
                      </td>
                      <td>{c.currentCity || "—"}</td>
                      <td>{c.experience || "—"}</td>
                      <td>
                        <div className="flex gap-1">
                          {c.skills?.slice(0, 3).map((s) => (
                            <span key={s} className="badge violet">
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <button
                          className="icon-btn"
                          aria-label={"Edit " + c.fullName}
                          onClick={() => setEditing(c)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-btn danger"
                          aria-label={"Archive " + c.fullName}
                          onClick={() => setDeleting(c)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
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
            title={q ? "No matching candidates" : "Meet your next great hire"}
            description={
              q
                ? "Try another name, phone, location or skill."
                : "Add consented candidate details to build your talent database."
            }
            action={
              <button className="btn primary" onClick={() => setEditing({})}>
                <Plus size={16} />
                Add candidate
              </button>
            }
          />
        )}
      </div>
      {editing && (
        <FormModal
          title={(editing._id ? "Edit" : "Add") + " candidate"}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={handleSubmit(save)}>
            <div className="form-grid">
              {fields.slice(0, 3).map(([key, label, required]) => (
                <Field label={label + (required ? " *" : "")} key={key}>
                  <input
                    type={
                      key === "email"
                        ? "email"
                        : key === "phone"
                          ? "tel"
                          : "text"
                    }
                    required={required}
                    maxLength={500}
                    {...register(key)}
                  />
                </Field>
              ))}
              <CandidateFields
                register={register}
                watch={watch}
                setValue={setValue}
              />
              <Field label="Notes">
                <textarea rows={3} maxLength={5000} {...register("notes")} />
              </Field>
              <label className="consent-label">
                <input type="checkbox" required {...register("consent")} />
                <span>
                  I confirm this candidate has consented to recruitment
                  processing.
                </span>
              </label>
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
                {isSubmitting ? "Saving…" : "Save candidate"}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </FormModal>
      )}
      {deleting && (
        <FormModal title="Archive candidate?" onClose={() => setDeleting(null)}>
          <div className="p-6">
            <p>
              Archive {deleting.fullName}? Candidates with applications are
              retained for their history.
            </p>
            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button className="btn danger-solid" onClick={remove}>
                Archive
              </button>
            </div>
          </div>
        </FormModal>
      )}
    </>
  );
}
