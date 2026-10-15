import Permission from "../components/Permission";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import {
  Plus,
  Pencil,
  UserCheck,
  UserX,
  Eye,
  EyeOff,
  UserRound,
  Building2,
  KeyRound,
  UserPlus,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import { useAuth } from "../store/auth";
import DepartmentField from "../features/DepartmentField";
import {
  Field,
  FormModal,
  SearchInput,
  Pagination,
  LoadingSkeleton,
  ErrorState,
  EmptyState,
  StatusBadge,
} from "../components/ui";
const labels = { "HR Manager": "HR", "Team Leader": "Manager" };
export default function Employees() {
  const current = useAuth((s) => s.user);
  const [data, setData] = useState(null),
    [options, setOptions] = useState(null),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [editing, setEditing] = useState(null),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState("");
  const {
    register,
    reset,
    watch,
    setValue,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm();
  const department = watch("department");
  async function load() {
    setError("");
    try {
      const [rows, meta] = await Promise.all([
        api.get("/employees", { params: { q, page } }),
        api.get("/employees/options"),
      ]);
      setData(rows.data);
      setOptions(meta.data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [q, page]);
  useEffect(() => {
    if (editing) {
      reset({
        name: editing.name || "",
        email: editing.email || "",
        loginId: editing.loginId || "",
        phone: editing.phone || "",
        department: editing.department || "",
        team: editing.team || "",
        role: editing.role || "Recruiter",
        password: "",
        active: editing.active ?? true,
      });
      setVisible(false);
    }
  }, [editing]);
  useEffect(() => {
    if (editing && !editing._id) {
      const role = {
        hr: "HR Manager",
        recruitment: "Recruiter",
        bde: "BDE",
        management: "Team Leader",
        sales: "Sales Manager",
        finance: "Finance Manager",
        accounts: "Account Manager",
      }[department?.toLowerCase()];
      if (role && options?.roles.some((r) => r.value === role))
        setValue("role", role);
      setValue("team", "");
    }
  }, [department]);
  async function save(values) {
    try {
      const body = { ...values };
      if (editing._id && !body.password) delete body.password;
      if (editing._id) await api.patch("/employees/" + editing._id, body);
      else await api.post("/employees", body);
      toast.success(
        editing._id
          ? "Employee updated"
          : "Account created. Employee can now sign in.",
      );
      setEditing(null);
      load();
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function toggle(row) {
    setBusy(row._id);
    try {
      await api.patch("/employees/" + row._id, { active: !row.active });
      toast.success(row.active ? "Account deactivated" : "Account activated");
      load();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy("");
    }
  }
  if (error) return <ErrorState error={error} retry={load} />;
  if (!data || !options) return <LoadingSkeleton />;
  const canEdit = (row) =>
    options.canManage &&
    String(row._id) !== String(current.id) &&
    options.roles.some((r) => r.value === row.role);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR PEOPLE. YOUR TEAM.</div>
          <h1>
            People & teams<span className="heading-dot">.</span>
          </h1>
          <p>Create employee logins, assign departments and manage access.</p>
        </div>
        {options.canManage && (
          <Permission module={"employees"} action="create">
            <button className="btn primary" onClick={() => setEditing({})}>
              <Plus size={16} />
              Add team member
            </button>
          </Permission>
        )}
      </div>
      <div className="module-subnav">
        <Link to="/people">Employees</Link>
        <Link to="/teams">Teams</Link>
        <Link to="/departments">Departments</Link>
        <Link to="/attendance">Attendance</Link>
      </div>
      <section className="panel">
        <div className="records-toolbar">
          <span className="record-tab">
            Employees <span className="count-pill">{data.total}</span>
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
                    <th>EMPLOYEE</th>
                    <th>LOGIN ID / EMAIL</th>
                    <th>DEPARTMENT</th>
                    <th>ROLE</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row._id}>
                      <td>
                        <strong>{row.name}</strong>
                      </td>
                      <td>
                        <div>{row.loginId || row.email}</div>
                        <small>{row.loginId ? row.email : ""}</small>
                      </td>
                      <td>{row.department || "Not assigned"}</td>
                      <td>{labels[row.role] || row.role}</td>
                      <td>
                        <StatusBadge>
                          {row.active ? "Active" : "Inactive"}
                        </StatusBadge>
                      </td>
                      <td>
                        {canEdit(row) && (
                          <div className="flex gap-1">
                            <Permission module={"employees"} action="edit">
                              <button
                                className="icon-btn"
                                aria-label={"Edit " + row.name}
                                onClick={() => setEditing(row)}
                              >
                                <Pencil size={16} />
                              </button>
                            </Permission>
                            <Permission
                              module="employees"
                              action={row.active ? "delete" : "edit"}
                            >
                              <button
                                className="icon-btn"
                                disabled={busy === row._id}
                                aria-label={
                                  (row.active ? "Deactivate " : "Activate ") +
                                  row.name
                                }
                                onClick={() => toggle(row)}
                              >
                                {row.active ? (
                                  <UserX size={16} />
                                ) : (
                                  <UserCheck size={16} />
                                )}
                              </button>
                            </Permission>
                          </div>
                        )}
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
            title="Build your team"
            description="Add employees with their department, role and sign-in credentials."
          />
        )}
      </section>
      {editing && (
        <FormModal
          className="employee-modal"
          title={
            <span className="flex items-center gap-3">
              <span className="employee-title-icon">
                <UserPlus size={21} />
              </span>
              {editing._id ? "Edit employee" : "Add team member"}
            </span>
          }
          description="Give your teammate a place in your workspace."
          onClose={() => setEditing(null)}
        >
          <form className="employee-form" onSubmit={handleSubmit(save)}>
            <div className="employee-form-content space-y-6">
              <section
                className="employee-section"
                aria-labelledby="employee-personal-title"
              >
                <div className="employee-section-heading">
                  <UserRound size={17} />
                  <div>
                    <h3 id="employee-personal-title">Personal information</h3>
                    <p>Start with your teammate's contact details.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                  <Field label="Full name *">
                    <input
                      required
                      maxLength={100}
                      placeholder="e.g. Snehalata Das"
                      autoComplete="name"
                      {...register("name")}
                    />
                  </Field>
                  <Field label="Work email *">
                    <input
                      type="email"
                      required
                      maxLength={254}
                      placeholder="name@company.com"
                      autoComplete="email"
                      {...register("email")}
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      type="tel"
                      maxLength={30}
                      placeholder="Enter phone number"
                      autoComplete="tel"
                      {...register("phone")}
                    />
                  </Field>
                </div>
              </section>
              <section
                className="employee-section"
                aria-labelledby="employee-workspace-title"
              >
                <div className="employee-section-heading">
                  <Building2 size={17} />
                  <div>
                    <h3 id="employee-workspace-title">Workspace & access</h3>
                    <p>Choose where they belong and what they can access.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                  <DepartmentField
                    register={register}
                    watch={watch}
                    setValue={setValue}
                    required
                  />
                  <Field label="Access role *">
                    <select required {...register("role")}>
                      {options.roles.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <small>Controls available modules and actions.</small>
                  </Field>
                  <Field label="Team">
                    <select {...register("team")}>
                      <option value="">No team assigned</option>
                      {options.teams
                        .filter(
                          (t) => !t.department || t.department === department,
                        )
                        .map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>
              </section>
              <section
                className="employee-section"
                aria-labelledby="employee-signin-title"
              >
                <div className="employee-section-heading">
                  <KeyRound size={17} />
                  <div>
                    <h3 id="employee-signin-title">Sign-in details</h3>
                    <p>
                      Set the credentials your teammate will use to sign in.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                  <Field label="Login ID *">
                    <input
                      required
                      minLength={3}
                      maxLength={254}
                      pattern="[a-zA-Z0-9][a-zA-Z0-9._\x2d]{2,49}|[^\s@]+@[^\s@]+\.[^\s@]+"
                      placeholder="e.g. snehalata.d"
                      autoComplete="off"
                      {...register("loginId")}
                    />
                    <small
                      className={
                        watch("loginId")?.includes("@") &&
                        watch("loginId").trim().toLowerCase() !==
                          (watch("email") || "").trim().toLowerCase()
                          ? "employee-input-hint-error"
                          : ""
                      }
                    >
                      {watch("loginId")?.includes("@")
                        ? "An email-style login ID must match the work email above."
                        : "Use a short username or the matching work email."}
                    </small>
                  </Field>
                  <Field
                    label={
                      editing._id ? "New password (optional)" : "Password *"
                    }
                  >
                    <div className="employee-password">
                      <input
                        type={visible ? "text" : "password"}
                        required={!editing._id}
                        minLength={8}
                        maxLength={72}
                        placeholder={
                          editing._id
                            ? "Leave blank to keep password"
                            : "Enter a strong password"
                        }
                        autoComplete="new-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        {...register("password")}
                      />
                      <button
                        type="button"
                        aria-label={visible ? "Hide password" : "Show password"}
                        aria-pressed={visible}
                        onClick={() => setVisible(!visible)}
                      >
                        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                    <small>
                      At least 8 characters. Uppercase, numbers and symbols are
                      optional.
                    </small>
                  </Field>
                </div>
              </section>
              <label className="employee-account-status">
                <input
                  type="checkbox"
                  role="switch"
                  className="peer sr-only"
                  {...register("active")}
                />
                <span className="employee-status-switch" aria-hidden="true">
                  <span />
                </span>
                <span className="min-w-0 flex-1">
                  <strong>Account active</strong>
                  <small>
                    {watch("active")
                      ? "Your teammate can sign in once the account is saved."
                      : "Sign-in stays disabled until you activate this account."}
                  </small>
                </span>
                <span className="employee-status-label">
                  {watch("active") ? "Active" : "Inactive"}
                </span>
              </label>
            </div>
            <div className="employee-form-footer">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={isSubmitting}>
                {isSubmitting ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  <UserCheck size={16} />
                )}{" "}
                {isSubmitting
                  ? "Saving..."
                  : editing._id
                    ? "Save changes"
                    : "Create account"}
                {!isSubmitting && <ArrowRight size={15} />}
              </button>
            </div>
          </form>
        </FormModal>
      )}
    </>
  );
}
