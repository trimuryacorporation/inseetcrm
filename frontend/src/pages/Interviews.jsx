import Permission from "../components/Permission";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Plus,
  CalendarDays,
  Pencil,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import {
  EmptyState,
  ErrorState,
  FormModal,
  Field,
  Pagination,
  StatusBadge,
  LoadingSkeleton,
} from "../components/ui";
export default function Interviews() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState(null),
    [applications, setApplications] = useState([]),
    [feedback, setFeedback] = useState(null),
    [feedbackItems, setFeedbackItems] = useState([]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm();
  async function load() {
    setError("");
    try {
      setData((await api.get("/interviews", { params: { page } })).data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    load();
  }, [page]);
  useEffect(() => {
    if (editing) {
      reset(
        editing._id
          ? {
              scheduledAt: new Date(
                new Date(editing.scheduledAt).getTime() -
                  new Date().getTimezoneOffset() * 60000,
              )
                .toISOString()
                .slice(0, 16),
              duration: editing.duration,
              type: editing.type,
              location: editing.location || "",
              interviewer: editing.interviewer || "",
              notes: editing.notes || "",
              status: editing.status,
            }
          : { duration: 30, type: "Video" },
      );
      api
        .get("/applications")
        .then((r) => setApplications(r.data.items))
        .catch((e) => toast.error(message(e)));
    }
  }, [editing]);
  async function save(values) {
    try {
      const body = {
        ...values,
        scheduledAt: new Date(values.scheduledAt).toISOString(),
      };
      if (editing._id) await api.patch("/interviews/" + editing._id, body);
      else await api.post("/interviews", body);
      toast.success("Interview saved");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function openFeedback(item) {
    try {
      setFeedbackItems(
        (await api.get("/interviews/" + item._id + "/feedback")).data,
      );
      reset({ rating: 3, recommendation: "Proceed", notes: "" });
      setFeedback(item);
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function saveFeedback(values) {
    try {
      await api.post("/interviews/" + feedback._id + "/feedback", {
        ...values,
        rating: Number(values.rating),
      });
      toast.success("Feedback saved");
      setFeedback(null);
    } catch (e) {
      toast.error(message(e));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            MEANINGFUL CONVERSATIONS. GREAT DECISIONS.
          </div>
          <h1>
            Interviews<span className="heading-dot">.</span>
          </h1>
          <p>Schedule conversations and capture feedback in one place.</p>
        </div>
        <Permission module={"interviews"} action="create">
          <button className="btn primary" onClick={() => setEditing({})}>
            <Plus size={16} />
            Schedule interview
          </button>
        </Permission>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>Interview schedule</h2>
            <p>Displayed in your local timezone</p>
          </div>
          <CalendarDays size={20} />
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
                    <th>CANDIDATE / JOB</th>
                    <th>SCHEDULE</th>
                    <th>TYPE</th>
                    <th>INTERVIEWER</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i._id}>
                      <td>
                        <strong>{i.candidate?.fullName}</strong>
                        <small>{i.job?.title}</small>
                      </td>
                      <td>
                        {new Date(i.scheduledAt).toLocaleString()}
                        <small>
                          {i.duration} minutes ·{" "}
                          {i.location || "Location not set"}
                        </small>
                      </td>
                      <td>{i.type}</td>
                      <td>{i.interviewer || "—"}</td>
                      <td>
                        <StatusBadge>{i.status}</StatusBadge>
                      </td>
                      <td>
                        <Permission module={"interviews"} action="edit">
                          <button
                            className="icon-btn"
                            aria-label="Edit interview"
                            onClick={() => setEditing(i)}
                          >
                            <Pencil size={16} />
                          </button>
                        </Permission>
                        <Permission module="interviews" action="edit">
                          <button
                            className="icon-btn"
                            aria-label="Interview feedback"
                            onClick={() => openFeedback(i)}
                          >
                            <MessageSquare size={16} />
                          </button>
                        </Permission>
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
            title="Your next great conversation awaits"
            description="Add a candidate to the pipeline, then schedule an interview."
            action={
              <Permission module={"interviews"} action="create">
                <button className="btn primary" onClick={() => setEditing({})}>
                  <Plus size={16} />
                  Schedule interview
                </button>
              </Permission>
            }
          />
        )}
      </div>
      {editing && (
        <FormModal
          title={editing._id ? "Update interview" : "Schedule interview"}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={handleSubmit(save)}>
            <div className="form-grid">
              {!editing._id && (
                <Field label="Application">
                  <select required {...register("application")}>
                    <option value="">Select an application</option>
                    {applications.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.candidate?.fullName} · {a.job?.title}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Date & time">
                <input
                  type="datetime-local"
                  required
                  {...register("scheduledAt")}
                />
              </Field>
              <Field label="Duration (minutes)">
                <input
                  type="number"
                  required
                  min={5}
                  max={480}
                  {...register("duration")}
                />
              </Field>
              <Field label="Interview type">
                <select {...register("type")}>
                  {[
                    "Walk-in",
                    "Phone",
                    "Video",
                    "HR",
                    "Technical",
                    "Final",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Location / meeting link">
                <input {...register("location")} />
              </Field>
              <Field label="Interviewer">
                <input {...register("interviewer")} />
              </Field>
              {editing._id && (
                <Field label="Status">
                  <select {...register("status")}>
                    {["Scheduled", "Rescheduled", "Completed", "Cancelled"].map(
                      (s) => (
                        <option key={s}>{s}</option>
                      ),
                    )}
                  </select>
                </Field>
              )}
              <Field label="Notes">
                <textarea rows={3} {...register("notes")} />
              </Field>
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
                {isSubmitting ? "Saving…" : "Save interview"}
              </button>
            </div>
          </form>
        </FormModal>
      )}
      {feedback && (
        <FormModal
          title={"Feedback · " + feedback.candidate?.fullName}
          onClose={() => setFeedback(null)}
        >
          <div className="p-6">
            {feedbackItems.map((f) => (
              <div key={f._id} className="feedback-item">
                <strong>
                  {f.author?.name} · {f.rating}/5 · {f.recommendation}
                </strong>
                <p>{f.notes}</p>
              </div>
            ))}
            <form onSubmit={handleSubmit(saveFeedback)}>
              <Field label="Rating (1–5)">
                <input
                  type="number"
                  required
                  min={1}
                  max={5}
                  {...register("rating")}
                />
              </Field>
              <Field label="Recommendation">
                <select {...register("recommendation")}>
                  <option>Proceed</option>
                  <option>Hold</option>
                  <option>Reject</option>
                </select>
              </Field>
              <Field label="Feedback">
                <textarea
                  required
                  maxLength={5000}
                  rows={4}
                  {...register("notes")}
                />
              </Field>
              <div className="modal-actions">
                <button className="btn primary" disabled={isSubmitting}>
                  {isSubmitting ? "Saving…" : "Save feedback"}
                </button>
              </div>
            </form>
          </div>
        </FormModal>
      )}
    </>
  );
}
