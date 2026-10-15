import { useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, ShieldCheck, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import { useAuth } from "../store/auth";
import { Field } from "../components/ui";
export default function Auth() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const mode = pathname.slice(1) || "login";
  const setup = mode === "setup",
    forgot = mode === "forgot-password",
    reset = mode === "reset-password" || mode === "accept-invitation";
  const schema = z.object({
    email: !reset
      ? z.string().email("Enter a valid email")
      : z.string().optional(),
    password: forgot
      ? z.string().optional()
      : setup || reset
        ? z
            .string()
            .min(12, "Use at least 12 characters")
            .max(72)
            .regex(/[A-Z]/, "Include an uppercase letter")
            .regex(/[0-9]/, "Include a number")
        : z.string().min(1, "Enter your password"),
    name: setup ? z.string().min(2, "Enter your name") : z.string().optional(),
    key: setup
      ? z.string().min(24, "Enter the configured setup key")
      : z.string().optional(),
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });
  const title = setup
    ? "Create your workspace"
    : forgot
      ? "Forgot your password?"
      : reset
        ? "Set your password"
        : "Welcome back";
  async function submit(data) {
    try {
      const response = await api.post("/auth/" + mode, {
        ...data,
        ...(reset ? { token: params.get("token") } : {}),
      });
      if (response.data.accessToken) {
        useAuth.getState().setSession(response.data);
        navigate("/");
      } else {
        toast.success(response.data.message);
        if (!forgot) navigate("/login");
      }
    } catch (e) {
      toast.error(message(e));
    }
  }
  return (
    <div className="auth-fullscreen">
      <img
        className="auth-photo-background"
        src="/images/inseet-recruiter-office.png"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
      />
      <div className="auth-photo-overlay" aria-hidden="true" />
      <Link
        to="/login"
        className="auth-page-brand auth-official-brand"
        aria-label="INSEET home"
      >
        <img
          src="/brand/inseet-logo.png"
          alt="INSEET"
          width="578"
          height="172"
          className="auth-official-logo"
          fetchPriority="high"
        />
      </Link>
      <section className="auth-photo-story" aria-label="INSEET recruitment">
        <h1>
          Great talent.
          <br />
          Stronger teams.
          <br />
          <em>Endless possibilities.</em>
        </h1>
        <p>Connecting Talent, Creating Careers</p>
      </section>
      <section className="auth-form-wrap auth-login-card">
        <div className="auth-form">
          <span className="eyebrow">YOUR NEXT GREAT HIRE STARTS HERE</span>
          <h2>{title}</h2>
          {mode !== "login" && (
            <p>
              {setup
                ? "Configure your first Super Admin account."
                : forgot
                  ? "We’ll email you a secure password reset link."
                  : reset
                    ? "Use at least 12 characters, an uppercase letter and a number."
                    : ""}
            </p>
          )}
          <form onSubmit={handleSubmit(submit)}>
            {setup && (
              <>
                <Field label="Full name" error={errors.name}>
                  <input autoComplete="name" {...register("name")} />
                </Field>
                <Field label="Workspace setup key" error={errors.key}>
                  <input type="password" {...register("key")} />
                </Field>
              </>
            )}
            {!reset && (
              <Field label="Work email" error={errors.email}>
                <input
                  placeholder="you@company.com"
                  autoComplete="email"
                  {...register("email")}
                />
              </Field>
            )}
            {!forgot && (
              <Field
                label={reset ? "New password" : "Password"}
                error={errors.password}
              >
                <div className="password-input">
                  <input
                    type={visible ? "text" : "password"}
                    autoComplete={
                      reset || setup ? "new-password" : "current-password"
                    }
                    {...register("password")}
                  />
                  <button
                    type="button"
                    aria-label={visible ? "Hide password" : "Show password"}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
            )}
            {mode === "login" && (
              <div className="text-right text-sm mb-6">
                <Link className="text-indigo-600" to="/forgot-password">
                  Forgot password?
                </Link>
              </div>
            )}
            <button className="btn primary w-full" disabled={isSubmitting}>
              {isSubmitting
                ? "Please wait…"
                : setup
                  ? "Create workspace"
                  : forgot
                    ? "Send reset link"
                    : reset
                      ? "Save password"
                      : "Sign in to workspace"}
              <ArrowRight size={17} />
            </button>
          </form>
          {mode !== "login" && (
            <p className="auth-bottom">
              <Link to="/login">Back to sign in</Link>
            </p>
          )}
          <div className="secure-note">
            <ShieldCheck size={16} /> Secure access. Your people’s data stays
            protected.
          </div>
        </div>
        <p className="auth-legal">
          INSEET · Trimurya Corporation Private Limited
        </p>
      </section>
    </div>
  );
}
