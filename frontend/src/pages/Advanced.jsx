import { useEffect, useRef, useState } from "react";
import { Upload, Download, Trash2, FileText, Mail, Send } from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  FormModal,
  Field,
  StatusBadge,
} from "../components/ui";
import WorkspaceModule from "./WorkspaceModule";
export function Documents() {
  const [items, setItems] = useState(null),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false),
    [category, setCategory] = useState("Resume"),
    [deleting, setDeleting] = useState(null);
  const ref = useRef();
  async function load() {
    setError("");
    try {
      setItems((await api.get("/documents")).data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function upload(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Files must be 10 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("category", category);
      body.append("file", file);
      await api.post("/documents", body);
      toast.success("Document uploaded privately");
      load();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  }
  async function download(d) {
    try {
      const { url } = (await api.get("/documents/" + d._id + "/download")).data;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function remove() {
    try {
      await api.delete("/documents/" + deleting._id);
      toast.success("Document deleted from storage");
      setDeleting(null);
      load();
    } catch (e) {
      toast.error(message(e));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PRIVATE, ORGANIZED, AND ALWAYS AT HAND</div>
          <h1>
            Documents<span className="heading-dot">.</span>
          </h1>
          <p>
            Secure files with authorized downloads that expire in 60 seconds.
          </p>
        </div>
      </div>
      <section className="panel upload-panel">
        <div>
          <h2>Upload to your workspace</h2>
          <p>PDF, DOCX, PNG, JPEG · Up to 10 MB · Private object storage</p>
        </div>
        <select
          aria-label="Document category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {[
            "Resume",
            "Client Agreement",
            "Vendor Agreement",
            "Offer Letter",
            "Joining Document",
            "Invoice",
            "Company Document",
          ].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          ref={ref}
          type="file"
          hidden
          accept=".pdf,.docx,.png,.jpg,.jpeg"
          onChange={(e) => upload(e.target.files[0])}
        />
        <button
          className="btn primary"
          disabled={uploading}
          onClick={() => ref.current.click()}
        >
          <Upload size={16} />
          {uploading ? "Uploading…" : "Choose file"}
        </button>
      </section>
      <section className="panel mt-6">
        {error ? (
          <ErrorState error={error} retry={load} />
        ) : !items ? (
          <LoadingSkeleton />
        ) : items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>DOCUMENT</th>
                  <th>CATEGORY</th>
                  <th>SIZE</th>
                  <th>UPLOADED</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d._id}>
                    <td>
                      <div className="job-title">
                        <span className="job-symbol">
                          <FileText size={17} />
                        </span>
                        <strong>{d.name}</strong>
                      </div>
                    </td>
                    <td>{d.category}</td>
                    <td>{(d.size / 1024).toFixed(1)} KB</td>
                    <td>{new Date(d.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="icon-btn"
                        aria-label={"Download " + d.name}
                        onClick={() => download(d)}
                      >
                        <Download size={16} />
                      </button>
                      <button
                        className="icon-btn danger"
                        aria-label={"Delete " + d.name}
                        onClick={() => setDeleting(d)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="A secure home for your documents"
            description="Upload resumes, agreements, and company documents after configuring private S3 storage."
          />
        )}
      </section>
      {deleting && (
        <FormModal
          title="Delete document permanently?"
          onClose={() => setDeleting(null)}
        >
          <div className="p-6">
            <p>
              {deleting.name} will be permanently deleted from object storage.
              Its metadata and audit history will be retained.
            </p>
            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => setDeleting(null)}
              >
                Cancel
              </button>
              <button className="btn danger-solid" onClick={remove}>
                Delete permanently
              </button>
            </div>
          </div>
        </FormModal>
      )}
    </>
  );
}
export function Communication() {
  const [tab, setTab] = useState("templates"),
    [history, setHistory] = useState([]),
    [compose, setCompose] = useState(false),
    [candidates, setCandidates] = useState([]),
    [templates, setTemplates] = useState([]),
    [candidate, setCandidate] = useState(""),
    [template, setTemplate] = useState(""),
    [sending, setSending] = useState(false);
  async function loadHistory() {
    try {
      setHistory((await api.get("/communication/history")).data);
    } catch (e) {
      toast.error(message(e));
    }
  }
  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab]);
  async function open() {
    try {
      const [c, t] = await Promise.all([
        api.get("/candidates?limit=100"),
        api.get("/email-templates?limit=100"),
      ]);
      setCandidates(c.data.items.filter((v) => v.consent && v.email));
      setTemplates(t.data.items);
      setCompose(true);
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function send(e) {
    e.preventDefault();
    setSending(true);
    try {
      await api.post("/communication/email", { candidate, template });
      toast.success("Email sent");
      setCompose(false);
      setTab("history");
      loadHistory();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      <div className="communication-tabs">
        <div className="module-subnav">
          <button
            className={"btn " + (tab === "templates" ? "primary" : "secondary")}
            onClick={() => setTab("templates")}
          >
            Email templates
          </button>
          <button
            className={"btn " + (tab === "history" ? "primary" : "secondary")}
            onClick={() => setTab("history")}
          >
            Communication history
          </button>
        </div>
        <button className="btn primary" onClick={open}>
          <Send size={16} />
          Send candidate email
        </button>
      </div>
      {tab === "templates" ? (
        <WorkspaceModule module="email-templates" />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <div className="eyebrow">EVERY CONVERSATION, IN CONTEXT</div>
              <h1>
                Communication history<span className="heading-dot">.</span>
              </h1>
              <p>Delivery status for emails sent from your account.</p>
            </div>
          </div>
          <section className="panel">
            {history.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>RECIPIENT</th>
                      <th>SUBJECT</th>
                      <th>DATE</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h._id}>
                        <td>{h.candidate?.fullName}</td>
                        <td>{h.subject}</td>
                        <td>{new Date(h.createdAt).toLocaleString()}</td>
                        <td>
                          <StatusBadge>{h.status}</StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Your communication history starts here"
                description="Send an approved template to a consented candidate with an email address."
              />
            )}
          </section>
        </>
      )}
      {compose && (
        <FormModal
          title="Send candidate email"
          onClose={() => setCompose(false)}
        >
          <form className="p-6" onSubmit={send}>
            <Field label="Consented candidate">
              <select
                required
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
              >
                <option value="">Select candidate</option>
                {candidates.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.fullName} · {c.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Email template">
              <select
                required
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
              >
                <option value="">Select template</option>
                {templates.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            {templates.find((t) => t._id === template) && (
              <div className="email-preview">
                <strong>
                  {templates.find((t) => t._id === template).subject}
                </strong>
                <p>{templates.find((t) => t._id === template).body}</p>
              </div>
            )}
            <p className="form-note">
              This sends a real email using your configured SMTP provider. Use{" "}
              {"{{name}}"} in the template body to insert the candidate’s name.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setCompose(false)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={sending}>
                {sending ? "Sending…" : "Send email"}
                <Send size={16} />
              </button>
            </div>
          </form>
        </FormModal>
      )}
    </>
  );
}
