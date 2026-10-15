import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { Layers, ArrowLeft, ShieldCheck } from "lucide-react";
import { useAuth } from "./store/auth";
import { restore } from "./services/api";
import AppLayout, { navigation } from "./layouts/AppLayout";
const AccessControl = lazy(() => import("./pages/AccessControl"));
const Employees = lazy(() => import("./pages/Employees"));
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Records = lazy(() => import("./pages/Records"));
const Candidates = lazy(() => import("./pages/Candidates"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const Interviews = lazy(() => import("./pages/Interviews"));
const WorkspaceModule = lazy(() => import("./pages/WorkspaceModule"));
const Finance = lazy(() => import("./pages/Finance"));
const Attendance = lazy(() =>
  import("./pages/Operations").then((m) => ({ default: m.Attendance })),
);
const Reports = lazy(() =>
  import("./pages/Operations").then((m) => ({ default: m.Reports })),
);
const Documents = lazy(() =>
  import("./pages/Advanced").then((m) => ({ default: m.Documents })),
);
const Communication = lazy(() =>
  import("./pages/Advanced").then((m) => ({ default: m.Communication })),
);
const Settings = lazy(() => import("./pages/Settings"));
const Portal = lazy(() =>
  import("./pages/Portal").then((m) => ({ default: m.Portal })),
);
const Assignments = lazy(() =>
  import("./pages/Portal").then((m) => ({ default: m.Assignments })),
);
const staff = [
  "Super Admin",
  "Admin",
  "HR Manager",
  "Recruiter",
  "Team Leader",
  "Sales Manager",
  "BDE",
  "Account Manager",
  "Finance Manager",
];
function Protected({ children }) {
  const user = useAuth((s) => s.user);
  return user ? children : <Navigate to="/login" replace />;
}
function WorkspaceHome() {
  const user = useAuth((s) => s.user);
  return staff.includes(user.role) ? <Dashboard /> : <Portal />;
}
function PlannedModule() {
  const { pathname } = useLocation();
  const label =
    navigation.flatMap((n) => n[1]).find((n) => n[1] === pathname)?.[0] ||
    "Page not found";
  return (
    <div className="panel module-notice">
      <span className="module-icon">
        <Layers size={30} />
      </span>
      <div className="eyebrow">BACK TO YOUR WORKSPACE</div>
      <h1>{label}</h1>
      <p>
        This page could not be found. Return to your workspace to keep things
        moving.
      </p>
      <Link to="/" className="btn primary">
        <ArrowLeft size={16} />
        Back to overview
      </Link>
    </div>
  );
}
export default function App() {
  const ready = useAuth((s) => s.ready),
    user = useAuth((s) => s.user);
  useEffect(() => {
    restore().catch(() => useAuth.getState().clear());
  }, []);
  if (!ready)
    return (
      <div className="boot-screen">
        <span className="brand dark-brand">
          INSEET<span className="brand-dot">.</span>
        </span>
        <span className="boot-loader" />
        <p>Opening your workspace…</p>
      </div>
    );
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <span className="boot-loader block" />
        </div>
      }
    >
      <Routes>
        {[
          "login",
          "setup",
          "forgot-password",
          "reset-password",
          "accept-invitation",
        ].map((path) => (
          <Route
            key={path}
            path={"/" + path}
            element={user ? <Navigate to="/" replace /> : <Auth key={path} />}
          />
        ))}
        <Route
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          <Route index element={<WorkspaceHome />} />
          <Route
            path="clients"
            element={<Records key="clients" type="clients" />}
          />
          <Route path="jobs" element={<Records key="jobs" type="jobs" />} />
          <Route path="candidates" element={<Candidates />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="interviews" element={<Interviews />} />
          <Route
            path="departments"
            element={<WorkspaceModule key="departments" module="departments" />}
          />
          <Route
            path="teams"
            element={<WorkspaceModule key="teams" module="teams" />}
          />
          <Route path="people" element={<Employees />} />
          <Route path="access-control" element={<AccessControl />} />
          <Route
            path="tasks"
            element={<WorkspaceModule key="tasks" module="tasks" />}
          />
          <Route
            path="sales"
            element={<WorkspaceModule key="leads" module="leads" />}
          />
          <Route
            path="deals"
            element={<WorkspaceModule key="deals" module="deals" />}
          />
          <Route
            path="vendors"
            element={<WorkspaceModule key="vendors" module="vendors" />}
          />
          <Route
            path="placements"
            element={<WorkspaceModule key="placements" module="placements" />}
          />
          <Route
            path="leaves"
            element={<WorkspaceModule key="leaves" module="leaves" />}
          />
          <Route
            path="offers"
            element={<WorkspaceModule key="offers" module="offers" />}
          />
          <Route
            path="expenses"
            element={<WorkspaceModule key="expenses" module="expenses" />}
          />
          <Route
            path="incentives"
            element={<WorkspaceModule key="incentives" module="incentives" />}
          />
          <Route
            path="branches"
            element={<WorkspaceModule key="branches" module="branches" />}
          />
          <Route path="communication" element={<Communication />} />
          <Route path="finance" element={<Finance />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="reports" element={<Reports />} />
          <Route path="documents" element={<Documents />} />
          <Route path="assignments" element={<Assignments />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<PlannedModule />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
