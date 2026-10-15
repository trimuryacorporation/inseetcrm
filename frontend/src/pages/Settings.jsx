import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  UserRound,
  Mail,
  Building2,
  Save,
  Pencil,
  UserPlus,
  LockKeyhole,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import { useAuth } from "../store/auth";
import { Field, StatusBadge, FormModal } from "../components/ui";
export default function Settings() {
  const user = useAuth((s) => s.user);
  const [tab, setTab] = useState("profile"),
    [users, setUsers] = useState([]),
    [invite, setInvite] = useState(false),
    [editingUser, setEditingUser] = useState(null),
    [sessions, setSessions] = useState([]),
    [editingProfile, setEditingProfile] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, isDirty },
    reset,
    setFocus,
  } = useForm({ defaultValues: { name: user.name } });
  const admin = ["Super Admin", "Admin"].includes(user.role);
  useEffect(() => {
    setEditingProfile(false);
    reset(tab === "profile" ? { name: user.name } : {});
    if (tab === "security")
      api
        .get("/auth/sessions")
        .then((r) => setSessions(r.data))
        .catch((e) => toast.error(message(e)));
    if (tab === "team")
      api
        .get("/users")
        .then((r) => setUsers(r.data))
        .catch((e) => toast.error(message(e)));
  }, [tab]);
  function editProfile() {
    reset({ name: user.name });
    setEditingProfile(true);
    requestAnimationFrame(() => setFocus("name"));
  }
  function cancelProfileEdit() {
    reset({ name: user.name });
    setEditingProfile(false);
  }
  async function save(data) {
    if (tab === "profile" && !editingProfile) return;
    try {
      if (tab === "profile") {
        const r = await api.patch("/auth/profile", { name: data.name });
        useAuth.setState({ user: r.data });
        reset({ name: r.data.name });
        setEditingProfile(false);
        toast.success("Profile updated");
      } else {
        await api.post("/auth/change-password", {
          currentPassword: data.currentPassword,
          password: data.password,
        });
        toast.success("Password updated. Please sign in again.");
        useAuth.getState().clear();
      }
    } catch (e) {
      toast.error(message(e));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE THIS WORKSPACE YOURS</div>
          <h1>
            Settings<span className="heading-dot">.</span>
          </h1>
          <p>Your profile, your team, and your workspace security.</p>
        </div>
      </div>
      <div className="settings-layout">
        <aside className="settings-nav">
          {[
            ["profile", "My profile", UserRound],
            ["security", "Security", LockKeyhole],
            ...(admin ? [["team", "Team & invitations", UserPlus]] : []),
            ["company", "Company profile", Building2],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              disabled={isSubmitting}
              onClick={() => setTab(id)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </aside>
        <section className="panel settings-panel">
          {tab === "profile" || tab === "security" ? (
            <>
              <div className="panel-heading">
                <div>
                  <h2>
                    {tab === "profile"
                      ? "Personal information"
                      : "Change password"}
                  </h2>
                  <p>
                    {tab === "profile"
                      ? "Manage how you appear across INSEET."
                      : "Use at least 8 characters. Uppercase letters, numbers and symbols are optional."}
                  </p>
                </div>
              </div>
              <form onSubmit={handleSubmit(save)} className="settings-form">
                {tab === "profile" ? (
                  <>
                    <div className="profile-summary">
                      <span className="avatar large">
                        {user.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <h3>{user.name}</h3>
                        <span className="badge violet">{user.role}</span>
                      </div>
                    </div>
                    <Field label="Full name">
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        readOnly={!editingProfile || isSubmitting}
                        autoComplete="name"
                        {...register("name")}
                      />
                    </Field>
                    <Field label="Email address">
                      <input value={user.email} disabled />
                    </Field>
                    {user.loginId && (
                      <Field label="Login ID">
                        <input value={user.loginId} disabled />
                      </Field>
                    )}
                    {user.department && (
                      <Field label="Department">
                        <input value={user.department} disabled />
                      </Field>
                    )}
                  </>
                ) : (
                  <>
                    <Field label="Current password">
                      <input
                        type="password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        required
                        autoComplete="current-password"
                        {...register("currentPassword")}
                      />
                    </Field>
                    <Field label="New password">
                      <input
                        type="password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        required
                        minLength={8}
                        maxLength={72}
                        autoComplete="new-password"
                        {...register("password")}
                      />
                    </Field>
                  </>
                )}
                <div className="profile-form-actions">
                  {tab === "profile" && !editingProfile ? (
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={editProfile}
                    >
                      <Pencil size={16} /> Edit profile
                    </button>
                  ) : (
                    <>
                      <button
                        type="submit"
                        className="btn primary"
                        disabled={
                          isSubmitting || (tab === "profile" && !isDirty)
                        }
                      >
                        <Save size={16} />
                        {isSubmitting ? "Saving?" : "Save changes"}
                      </button>
                      {tab === "profile" && (
                        <button
                          type="button"
                          className="btn secondary"
                          disabled={isSubmitting}
                          onClick={cancelProfileEdit}
                        >
                          Cancel
                        </button>
                      )}
                    </>
                  )}
                </div>
              </form>
              {tab === "security" && (
                <div className="p-6">
                  <h3 className="font-semibold mb-4">Active sessions</h3>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>CREATED</th>
                          <th>EXPIRES</th>
                          <th>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map((session) => (
                          <tr key={session._id}>
                            <td>
                              {new Date(session.createdAt).toLocaleString()}
                            </td>
                            <td>
                              {new Date(session.expiresAt).toLocaleString()}
                            </td>
                            <td>
                              <button
                                className="btn secondary"
                                onClick={async () => {
                                  try {
                                    await api.delete(
                                      "/auth/sessions/" + session._id,
                                    );
                                    setSessions(
                                      sessions.filter(
                                        (v) => v._id !== session._id,
                                      ),
                                    );
                                    toast.success("Session revoked");
                                  } catch (e) {
                                    toast.error(message(e));
                                  }
                                }}
                              >
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : tab === "company" ? (
            <>
              <div className="panel-heading">
                <h2>Company profile</h2>
              </div>
              <div className="company-profile">
                <div className="brand dark-brand">
                  INSEET<span className="brand-dot">.</span>
                </div>
                <p>Connecting Talent, Creating Careers</p>
                <dl>
                  <dt>Parent company</dt>
                  <dd>Trimurya Corporation Private Limited</dd>
                  <dt>Business</dt>
                  <dd>
                    Recruitment, Staffing, Bulk Hiring, Blue-Collar Hiring and
                    White-Collar Hiring
                  </dd>
                </dl>
              </div>
            </>
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <h2>Workspace members</h2>
                  <p>Invite colleagues with the right access.</p>
                </div>
                <button className="btn primary" onClick={() => setInvite(true)}>
                  <UserPlus size={16} />
                  Invite user
                </button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>NAME</th>
                      <th>EMAIL</th>
                      <th>ROLE</th>
                      <th>STATUS</th>
                      <th>ACCESS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u._id}>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td>{u.role}</td>
                        <td>
                          <StatusBadge>
                            {u.active ? "Active" : "Invited"}
                          </StatusBadge>
                        </td>
                        <td>
                          {u._id !== user.id && (
                            <button
                              className="btn secondary"
                              onClick={() => setEditingUser(u)}
                            >
                              Manage access
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
      {editingUser && (
        <AccessEditor
          user={editingUser}
          superAdmin={user.role === "Super Admin"}
          onClose={() => setEditingUser(null)}
          onSaved={(updated) => {
            setUsers(
              users.map((u) =>
                u._id === updated.id ? { ...u, ...updated } : u,
              ),
            );
            setEditingUser(null);
          }}
        />
      )}
      {invite && (
        <Invite
          onClose={() => setInvite(false)}
          superAdmin={user.role === "Super Admin"}
        />
      )}
    </>
  );
}
function Invite({ onClose, superAdmin }) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();
  async function submit(data) {
    try {
      await api.post("/auth/invitations", data);
      toast.success("Invitation sent");
      onClose();
    } catch (e) {
      toast.error(message(e));
    }
  }
  return (
    <FormModal title="Invite a teammate" onClose={onClose}>
      <form className="p-6" onSubmit={handleSubmit(submit)}>
        <Field label="Full name">
          <input required minLength={2} {...register("name")} />
        </Field>
        <Field label="Work email">
          <input type="email" required {...register("email")} />
        </Field>
        <Field label="Role">
          <select {...register("role")}>
            {[
              ...(superAdmin ? ["Super Admin"] : []),
              "Admin",
              "HR Manager",
              "Recruiter",
              "Team Leader",
              "Sales Manager",
              "BDE",
              "Account Manager",
              "Finance Manager",
              "Vendor",
              "Client",
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send invitation"}
            <Mail size={16} />
          </button>
        </div>
      </form>
    </FormModal>
  );
}

function AccessEditor({ user, superAdmin, onClose, onSaved }) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm({ defaultValues: { role: user.role, active: user.active } });
  async function save(values) {
    try {
      const r = await api.patch("/users/" + user._id, values);
      toast.success("User access updated");
      onSaved(r.data);
    } catch (e) {
      toast.error(message(e));
    }
  }
  return (
    <FormModal title={"Access · " + user.name} onClose={onClose}>
      <form className="p-6" onSubmit={handleSubmit(save)}>
        <Field label="Role">
          <select {...register("role")}>
            {[
              ...(superAdmin ? ["Super Admin"] : []),
              "Admin",
              "HR Manager",
              "Recruiter",
              "Team Leader",
              "Sales Manager",
              "BDE",
              "Account Manager",
              "Finance Manager",
              "Vendor",
              "Client",
            ].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <label className="consent-label">
          <input type="checkbox" {...register("active")} />
          Account is active
        </label>
        <p className="form-note">
          Changing access invalidates existing authentication tokens. This does
          not send an invitation.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save access"}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
