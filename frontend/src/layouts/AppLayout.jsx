import { canAccess, pageModule } from "../utils/permissions";
import { io } from "socket.io-client";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  BriefcaseBusiness,
  Users,
  GitBranch,
  CalendarDays,
  UserRoundCog,
  TrendingUp,
  Handshake,
  ClipboardCheck,
  Wallet,
  BarChart3,
  MessagesSquare,
  FolderOpen,
  Settings,
  Search,
  Bell,
  ChevronDown,
  ChevronLeft,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  ArrowUpRight,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { api, message } from "../services/api";
import { useAuth } from "../store/auth";
import toast from "react-hot-toast";
export const navigation = [
  [
    "Workspace",
    [
      ["Overview", "/", LayoutDashboard],
      ["Clients", "/clients", Building2],
      ["Jobs", "/jobs", BriefcaseBusiness],
      ["Candidates", "/candidates", Users],
      ["ATS Pipeline", "/pipeline", GitBranch],
      ["Interviews", "/interviews", CalendarDays],
    ],
  ],
  [
    "Business",
    [
      ["People & teams", "/people", UserRoundCog],
      ["Departments", "/departments", Building2],
      ["Sales CRM", "/sales", TrendingUp],
      ["Vendors", "/vendors", Handshake],
      ["Placements", "/placements", ClipboardCheck],
      ["Finance", "/finance", Wallet],
    ],
  ],
  [
    "Manage",
    [
      ["Reports & analytics", "/reports", BarChart3],
      ["Communication", "/communication", MessagesSquare],
      ["Tasks & calendar", "/tasks", CalendarDays],
      ["Documents", "/documents", FolderOpen],
      ["Settings", "/settings", Settings],
      ["Access & permissions", "/access-control", ShieldCheck],
    ],
  ],
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [profile, setProfile] = useState(false),
    [notifications, setNotifications] = useState(null),
    [search, setSearch] = useState(""),
    [dark, setDark] = useState(localStorage.getItem("inseet-theme") === "dark");
  const accessToken = useAuth((s) => s.accessToken);
  useEffect(() => {
    if (!accessToken) return;
    const base = api.defaults.baseURL;
    const socket = io(
      base.startsWith("http") ? new URL(base).origin : window.location.origin,
      { auth: { token: accessToken }, withCredentials: true },
    );
    socket.on("notification", (n) => {
      toast(n.title, { icon: "🔔" });
      setNotifications((items) =>
        items === null
          ? null
          : [{ _id: n.id, title: n.title, createdAt: n.createdAt }, ...items],
      );
    });
    return () => socket.disconnect();
  }, [accessToken]);
  const user = useAuth((s) => s.user),
    location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    let active = true;
    const sync = () =>
      api
        .get("/auth/me")
        .then((r) => {
          if (active) useAuth.setState({ user: r.data });
        })
        .catch(() => {});
    const timer = setInterval(sync, 30000);
    window.addEventListener("focus", sync);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", sync);
    };
  }, []);
  useEffect(() => {
    if (!mobile) return;
    const handler = (e) => {
      if (e.key === "Escape") setMobile(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mobile]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("inseet-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    setMobile(false);
    setProfile(false);
    setNotifications(null);
  }, [location.pathname]);
  const visibleNavigation = navigation
    .map(([group, links]) => [
      group,
      links.filter((link) => canAccess(user, pageModule(link[1]))),
    ])
    .filter(([, links]) => links.length);
  const current =
    navigation
      .flatMap((n) => n[1])
      .find((n) => n[1] === location.pathname)?.[0] || "Workspace";
  async function logout() {
    try {
      await api.post("/auth/logout");
      useAuth.getState().clear();
      navigate("/login");
    } catch (e) {
      toast.error(message(e));
    }
  }
  async function loadNotifications() {
    if (notifications !== null) {
      setNotifications(null);
      return;
    }
    try {
      setNotifications((await api.get("/notifications")).data);
    } catch (e) {
      toast.error(message(e));
    }
  }
  return (
    <div className={"app-shell " + (collapsed ? "sidebar-collapsed" : "")}>
      {mobile && (
        <div className="mobile-overlay" onClick={() => setMobile(false)} />
      )}
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <div className="sidebar-brand">
          <NavLink
            to="/"
            className="sidebar-company-brand"
            aria-label="INSEET home"
            title="INSEET"
          >
            <span className="sidebar-logo-window">
              <img
                src="/brand/inseet-logo.png"
                alt="INSEET"
                className="sidebar-company-logo"
                width="578"
                height="172"
              />
            </span>
          </NavLink>
          <button
            aria-label="Close navigation"
            className="mobile-close icon-btn"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Main navigation">
          {visibleNavigation.map(([group, links]) => (
            <div className="nav-group" key={group}>
              {!collapsed && <p>{group}</p>}
              {links.map(([label, to, Icon]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) =>
                    "nav-link " + (isActive ? "active" : "")
                  }
                >
                  <Icon size={19} />
                  {!collapsed && (
                    <>
                      <span>{label}</span>
                      {label === "Overview" && (
                        <span className="nav-live">LIVE</span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle sidebar"
          >
            <ChevronLeft
              size={17}
              style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
            />
            {!collapsed && "Collapse sidebar"}
          </button>
        </div>
      </aside>
      <div className="main-shell" inert={mobile ? true : undefined}>
        <header className="app-header">
          <div className="flex items-center gap-3 min-w-0">
            <button
              aria-label="Open navigation"
              className="mobile-menu icon-btn"
              onClick={() => {
                setCollapsed(false);
                setMobile(true);
              }}
            >
              <Menu size={21} />
            </button>
            <div className="breadcrumbs">
              Workspace <span>/</span>
              <strong>{current}</strong>
            </div>
          </div>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate("/jobs?q=" + encodeURIComponent(search));
            }}
          >
            <Search size={16} />
            <input
              aria-label="Search jobs globally"
              placeholder="Search jobs, locations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <div className="header-actions">
            <button
              className="icon-btn"
              aria-label="Toggle color theme"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <div className="dropdown-anchor">
              <button
                className="icon-btn"
                aria-label="Notifications"
                aria-expanded={notifications !== null}
                onClick={loadNotifications}
              >
                <Bell size={20} />
              </button>
              {notifications !== null && (
                <div className="dropdown notification-dropdown">
                  <h3>Notifications</h3>
                  {notifications.length ? (
                    notifications.map((n) => (
                      <button
                        key={n._id}
                        onClick={async () => {
                          try {
                            await api.patch(
                              "/notifications/" + n._id + "/read",
                            );
                            setNotifications(
                              notifications.map((v) =>
                                v._id === n._id
                                  ? { ...v, readAt: new Date() }
                                  : v,
                              ),
                            );
                          } catch (e) {
                            toast.error(message(e));
                          }
                        }}
                      >
                        {!n.readAt && "● "}
                        {n.title}
                      </button>
                    ))
                  ) : (
                    <p>You’re all caught up.</p>
                  )}
                </div>
              )}
            </div>
            <div className="header-divider" />
            <div className="dropdown-anchor">
              <button
                className="profile-button"
                aria-expanded={profile}
                onClick={() => setProfile(!profile)}
              >
                <span className="avatar">
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <strong>{user.name}</strong>
                  <small title={user.role}>
                    {user.department || user.role}
                  </small>
                </div>
                <ChevronDown size={15} />
              </button>
              {profile && (
                <div className="dropdown">
                  <button onClick={() => navigate("/settings")}>
                    <Settings size={16} /> My profile
                  </button>
                  <button onClick={logout}>
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main-content" className="content">
          {canAccess(user, pageModule(location.pathname)) ? (
            <Outlet />
          ) : (
            <section className="panel p-10 text-center">
              <ShieldCheck className="mx-auto mb-4 text-violet-500" size={36} />
              <h1>Access restricted</h1>
              <p className="mt-3 text-slate-500">
                Your account does not have permission to view this module.
                Contact your Super Admin.
              </p>
            </section>
          )}
        </main>
        <footer className="app-footer">
          <span>
            © {new Date().getFullYear()} INSEET · Trimurya Corporation Private
            Limited
          </span>
          <span>
            <span className="online-dot" /> Connecting Talent, Creating Careers
          </span>
        </footer>
      </div>
    </div>
  );
}
