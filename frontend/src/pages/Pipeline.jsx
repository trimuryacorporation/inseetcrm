import { usePermission } from "../utils/permissions";
import Permission from "../components/Permission";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Plus,
  Users,
  MapPin,
  Clock,
  ArrowRight,
  History,
  GripVertical,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import {
  EmptyState,
  ErrorState,
  FormModal,
  Field,
  LoadingSkeleton,
} from "../components/ui";
export default function Pipeline() {
  const canEdit = usePermission("applications", "edit");
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false),
    [candidates, setCandidates] = useState([]),
    [jobs, setJobs] = useState([]),
    [job, setJob] = useState(""),
    [history, setHistory] = useState(null),
    [moving, setMoving] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();
  async function load() {
    setError("");
    try {
      setData(
        (await api.get("/applications", { params: job ? { job } : {} })).data,
      );
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    load();
  }, [job]);
  useEffect(() => {
    api
      .get("/jobs?limit=100&status=Open")
      .then((r) => setJobs(r.data.items))
      .catch(() => {});
  }, []);
  async function createOpen() {
    try {
      setCandidates((await api.get("/candidates?limit=100")).data.items);
      setCreating(true);
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function create(values) {
    try {
      await api.post("/applications", values);
      toast.success("Candidate added to pipeline");
      setCreating(false);
      load();
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function move(application, stage) {
    if (application.stage === stage || moving) return;
    setMoving(application._id);
    try {
      await api.patch("/applications/" + application._id + "/stage", {
        stage,
        version: application.version,
      });
      toast.success("Moved to " + stage);
      await load();
    } catch (e) {
      toast.error(message(e));
      load();
    } finally {
      setMoving(null);
    }
  }
  async function viewHistory(application) {
    try {
      setHistory({
        application,
        items: (await api.get("/applications/" + application._id + "/history"))
          .data,
      });
    } catch (e) {
      toast.error(message(e));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FROM FIRST HELLO TO FIRST DAY</div>
          <h1>
            Recruitment pipeline<span className="heading-dot">.</span>
          </h1>
          <p>
            Move talent forward. Drag cards or use each candidate’s stage
            selector.
          </p>
        </div>
        <div className="page-actions">
          <select
            aria-label="Filter pipeline by job"
            value={job}
            onChange={(e) => setJob(e.target.value)}
          >
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option value={j._id} key={j._id}>
                {j.title}
              </option>
            ))}
          </select>
          <Permission module={"applications"} action="create">
            <button className="btn primary" onClick={createOpen}>
              <Plus size={16} />
              Add application
            </button>
          </Permission>
        </div>
      </div>
      {error ? (
        <ErrorState error={error} retry={load} />
      ) : !data ? (
        <LoadingSkeleton />
      ) : (
        <>
          <div className="pipeline-summary">
            <span className="badge violet">
              {data.items.length} applications
            </span>
            <span>Changes are saved with stage history and timestamps.</span>
          </div>
          <div className="kanban" aria-label="Recruitment stages">
            {data.stages.map((stage, index) => {
              const items = data.items.filter((a) => a.stage === stage);
              return (
                <section
                  className="kanban-column"
                  key={stage}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const a = data.items.find(
                      (v) => v._id === e.dataTransfer.getData("text/plain"),
                    );
                    if (a) move(a, stage);
                  }}
                >
                  <header>
                    <span
                      className="stage-dot"
                      style={{
                        background: [
                          "#8b79db",
                          "#739cdb",
                          "#5db6ae",
                          "#d5a26a",
                        ][index % 4],
                      }}
                    />
                    <h2>{stage}</h2>
                    <span className="count-pill">{items.length}</span>
                  </header>
                  <div className="kanban-cards">
                    {items.map((a) => (
                      <article
                        className={
                          "candidate-card " + (moving === a._id ? "moving" : "")
                        }
                        draggable={canEdit && !moving}
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/plain", a._id)
                        }
                        key={a._id}
                      >
                        <div className="candidate-card-head">
                          <span className="avatar">
                            {a.candidate?.fullName?.slice(0, 2).toUpperCase()}
                          </span>
                          <button
                            className="icon-btn"
                            aria-label="View stage history"
                            onClick={() => viewHistory(a)}
                          >
                            <History size={15} />
                          </button>
                        </div>
                        <h3>
                          {a.candidate?.fullName || "Candidate unavailable"}
                        </h3>
                        <p>{a.job?.title || "Job unavailable"}</p>
                        <div className="card-meta">
                          <MapPin size={12} />
                          {a.candidate?.currentCity || "Location not set"}
                        </div>
                        <div className="card-meta">
                          <Clock size={12} />
                          {new Date(a.updatedAt).toLocaleDateString()}
                        </div>
                        <select
                          aria-label={"Stage for " + a.candidate?.fullName}
                          disabled={!canEdit || !!moving}
                          value={a.stage}
                          onChange={(e) => move(a, e.target.value)}
                        >
                          {data.stages.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </article>
                    ))}
                    {!items.length && (
                      <div className="kanban-empty">Drop a candidate here</div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
      {creating && (
        <FormModal title="Add application" onClose={() => setCreating(false)}>
          <form className="p-6" onSubmit={handleSubmit(create)}>
            <Field label="Candidate">
              <select required {...register("candidate")}>
                <option value="">Choose candidate</option>
                {candidates.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.fullName} · {c.phone}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Open job">
              <select required {...register("job")}>
                <option value="">Choose job</option>
                {jobs.map((j) => (
                  <option key={j._id} value={j._id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </Field>
            <p className="form-note">
              Only candidates and jobs accessible to your role are shown. A
              candidate can apply to a job once.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={isSubmitting}>
                {isSubmitting ? "Adding…" : "Add to pipeline"}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </FormModal>
      )}
      {history && (
        <FormModal
          title="Application stage history"
          onClose={() => setHistory(null)}
        >
          <div className="p-6">
            <h3>{history.application.candidate?.fullName}</h3>
            <div className="activity-list">
              {history.items.map((h) => (
                <div key={h._id} className="activity-item">
                  <span className="activity-icon">
                    <History size={15} />
                  </span>
                  <div>
                    <p>
                      <strong>{h.to}</strong>
                      {h.from && " · from " + h.from}
                    </p>
                    <small>
                      {h.changedBy?.name} ·{" "}
                      {new Date(h.createdAt).toLocaleString()}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </FormModal>
      )}
    </>
  );
}
