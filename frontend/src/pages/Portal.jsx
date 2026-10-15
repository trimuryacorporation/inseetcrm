import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Plus, ShieldCheck, BriefcaseBusiness, Save } from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import { useAuth } from "../store/auth";
import {
  LoadingSkeleton,
  ErrorState,
  EmptyState,
  Field,
  FormModal,
  StatusBadge,
} from "../components/ui";
export function Portal() {
  const user = useAuth((s) => s.user);
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();
  async function load() {
    setError("");
    try {
      setData((await api.get("/portal")).data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(values) {
    try {
      await api.post("/portal/submissions", values);
      toast.success("Candidate submitted");
      setCreating(false);
      load();
    } catch (e) {
      toast.error(message(e));
    }
  }
  if (error) return <ErrorState error={error} retry={load} />;
  if (!data) return <LoadingSkeleton />;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR INSEET PARTNER WORKSPACE</div>
          <h1>
            Welcome, {user.name}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            {user.role === "Vendor"
              ? "View assigned opportunities and track your candidate submissions."
              : "Follow your job requirements and the candidates submitted to you."}
          </p>
        </div>
        {user.role === "Vendor" && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Plus size={16} />
            Submit candidate
          </button>
        )}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            {user.role === "Vendor" ? "Assigned jobs" : "Your job requirements"}
          </h2>
          <ShieldCheck size={19} />
        </div>
        {data.jobs.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>JOB TITLE</th>
                  <th>LOCATION</th>
                  <th>OPENINGS</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((j) => (
                  <tr key={j._id}>
                    <td>
                      <strong>{j.title}</strong>
                    </td>
                    <td>{j.location || "—"}</td>
                    <td>{j.openings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="Your opportunities will appear here"
            description="Your account manager can assign job requirements to your portal."
          />
        )}
      </section>
      <section className="panel mt-6">
        <div className="panel-heading">
          <h2>
            {user.role === "Vendor"
              ? "Your candidate submissions"
              : "Submitted candidates"}
          </h2>
        </div>
        {(data.submissions || data.applications)?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CANDIDATE</th>
                  <th>JOB</th>
                  <th>STATUS</th>
                  <th>UPDATED</th>
                </tr>
              </thead>
              <tbody>
                {(data.submissions || data.applications).map((s) => (
                  <tr key={s._id}>
                    <td>{s.candidateName || s.candidate?.fullName}</td>
                    <td>{s.job?.title}</td>
                    <td>
                      <StatusBadge>{s.status || s.stage}</StatusBadge>
                    </td>
                    <td>{new Date(s.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No submissions yet"
            description="Candidate submissions will appear here as hiring progresses."
          />
        )}
      </section>
      {creating && (
        <FormModal title="Submit candidate" onClose={() => setCreating(false)}>
          <form className="p-6" onSubmit={handleSubmit(save)}>
            <Field label="Assigned job">
              <select required {...register("job")}>
                <option value="">Choose job</option>
                {data.jobs.map((j) => (
                  <option value={j._id} key={j._id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Candidate name">
              <input required minLength={2} {...register("candidateName")} />
            </Field>
            <Field label="Phone">
              <input required type="tel" {...register("phone")} />
            </Field>
            <Field label="Email">
              <input type="email" {...register("email")} />
            </Field>
            <Field label="Notes">
              <textarea rows={3} {...register("notes")} />
            </Field>
            <label className="consent-label">
              <input required type="checkbox" {...register("consent")} />
              This candidate has consented to recruitment processing.
            </label>
            <div className="modal-actions">
              <button className="btn primary" disabled={isSubmitting}>
                {isSubmitting ? "Submitting…" : "Submit candidate"}
              </button>
            </div>
          </form>
        </FormModal>
      )}
    </>
  );
}
export function Assignments() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const { register, handleSubmit } = useForm();
  async function load() {
    setError("");
    try {
      setData((await api.get("/assignments")).data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(values) {
    setSaving(true);
    try {
      await api.patch("/assignments/jobs/" + values.job, {
        assignedRecruiters: values.recruiters ? [values.recruiters] : [],
        assignedVendors: values.vendor ? [values.vendor] : [],
      });
      toast.success("Assignments updated");
      load();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setSaving(false);
    }
  }
  async function link(values) {
    try {
      await api.patch("/assignments/clients/" + values.clientUser, {
        client: values.client,
      });
      toast.success("Client portal linked");
    } catch (e) {
      toast.error(message(e));
    }
  }
  const { register: regLink, handleSubmit: linkSubmit } = useForm();
  if (error) return <ErrorState error={error} retry={load} />;
  if (!data) return <LoadingSkeleton />;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            THE RIGHT PEOPLE. THE RIGHT OPPORTUNITIES.
          </div>
          <h1>
            Assignments<span className="heading-dot">.</span>
          </h1>
          <p>
            Manage recruiter ownership and partner access to job requirements.
          </p>
        </div>
      </div>
      <div className="dashboard-lower">
        <section className="panel">
          <div className="panel-heading">
            <h2>Job assignment</h2>
          </div>
          <form className="p-6" onSubmit={handleSubmit(save)}>
            <Field label="Job">
              <select required {...register("job")}>
                <option value="">Choose job</option>
                {data.jobs.map((j) => (
                  <option value={j._id} key={j._id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Recruiter">
              <select {...register("recruiters")}>
                <option value="">No recruiter</option>
                {data.users
                  .filter((u) =>
                    [
                      "Recruiter",
                      "Team Leader",
                      "HR Manager",
                      "Admin",
                      "Super Admin",
                    ].includes(u.role),
                  )
                  .map((u) => (
                    <option value={u._id} key={u._id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Vendor">
              <select {...register("vendor")}>
                <option value="">No vendor</option>
                {data.users
                  .filter((u) => u.role === "Vendor")
                  .map((u) => (
                    <option value={u._id} key={u._id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
            <p className="form-note mb-5">
              Saving replaces this job’s recruiter and vendor assignments with
              these selections.
            </p>
            <button className="btn primary" disabled={saving}>
              <Save size={16} />
              {saving ? "Saving…" : "Save assignment"}
            </button>
          </form>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Link a client portal</h2>
          </div>
          <form className="p-6" onSubmit={linkSubmit(link)}>
            <Field label="Client user">
              <select required {...regLink("clientUser")}>
                <option value="">Choose user</option>
                {data.users
                  .filter((u) => u.role === "Client")
                  .map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Client company">
              <select required {...regLink("client")}>
                <option value="">Choose company</option>
                {data.clients.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </Field>
            <button className="btn primary">
              <ShieldCheck size={16} />
              Link portal
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
