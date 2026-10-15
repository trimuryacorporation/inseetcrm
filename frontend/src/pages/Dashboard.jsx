import Permission from "../components/Permission";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  BriefcaseBusiness,
  Users,
  ArrowUpRight,
  Plus,
  ArrowRight,
  CalendarDays,
  Activity,
  Target,
  ChevronRight,
  Download,
  Layers,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { api, message } from "../services/api";
import { useAuth } from "../store/auth";
import {
  LoadingSkeleton,
  EmptyState,
  ErrorState,
  StatusBadge,
} from "../components/ui";
export default function Dashboard() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [chart, setChart] = useState("jobs");
  const user = useAuth((s) => s.user);
  async function load() {
    setError("");
    try {
      setData((await api.get("/dashboard")).data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  if (error) return <ErrorState error={error} retry={load} />;
  if (!data) return <LoadingSkeleton />;
  const stats = [
    [
      "Total clients",
      data.clients,
      Building2,
      "blue",
      data.activeClients + " active relationships",
    ],
    [
      "Open jobs",
      data.openJobs,
      BriefcaseBusiness,
      "violet",
      data.jobs + " total job requirements",
    ],
    [
      "Open vacancies",
      data.vacancies,
      Users,
      "teal",
      "Opportunities waiting for talent",
    ],
    [
      "Total candidates",
      data.totalCandidates,
      Users,
      "amber",
      "Consented talent in your database",
    ],
    [
      "Interviews today",
      data.interviewsToday,
      CalendarDays,
      "blue",
      "Conversations that create opportunity",
    ],
    [
      "Joined candidates",
      data.joinedCandidates,
      Target,
      "teal",
      "New beginnings made possible",
    ],
  ];
  const date = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR WORKSPACE AT A GLANCE</div>
          <h1>
            Let’s make great hires<span className="heading-dot">.</span>
          </h1>
          <p>
            Welcome back, {user.name.split(" ")[0]}. Here’s what’s happening at
            INSEET.
          </p>
        </div>
        <div className="page-actions">
          <span className="date-label">
            <CalendarDays size={15} />
            {date}
          </span>
          <Permission module="jobs" action="create">
            <Link to="/jobs?create=1" className="btn primary">
              <Plus size={17} /> Create job
            </Link>
          </Permission>
        </div>
      </div>
      <div className="welcome-banner">
        <div className="banner-icon">
          <Layers size={25} />
        </div>
        <div>
          <span>YOUR PEOPLE. YOUR POSSIBILITIES.</span>
          <h2>One workspace. Every opportunity.</h2>
          <p>
            Connect your clients and open roles to keep your hiring moving
            forward.
          </p>
        </div>
        <Permission module="clients">
          <Link to="/clients" className="banner-link">
            Manage clients <ArrowRight size={17} />
          </Link>
        </Permission>
        <div className="banner-orb" />
      </div>
      <div className="stat-grid">
        {stats.map(([label, value, Icon, color, caption]) => (
          <div className="stat-card" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <div className={"stat-icon " + color}>
                <Icon size={20} />
              </div>
            </div>
            <strong className="stat-value">
              {value.toLocaleString("en-IN")}
            </strong>
            <div className="stat-caption">
              <span className={"tiny-dot " + color} />
              {caption}
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-charts">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Hiring overview</h2>
              <p>Job requirements and vacancies over time</p>
            </div>
            <select
              aria-label="Chart metric"
              value={chart}
              onChange={(e) => setChart(e.target.value)}
            >
              <option value="jobs">Job requirements</option>
              <option value="openings">Vacancies</option>
            </select>
          </div>
          {data.monthly.length ? (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart
                  data={data.monthly.map((v) => ({ ...v, month: v._id }))}
                >
                  <defs>
                    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#6d5ce8"
                        stopOpacity={0.22}
                      />
                      <stop offset="95%" stopColor="#6d5ce8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 4"
                    vertical={false}
                    stroke="#e8edf4"
                  />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#8490a4" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#8490a4" }}
                    width={32}
                  />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey={chart}
                    stroke="#7161e9"
                    strokeWidth={3}
                    fill="url(#area)"
                    dot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Your hiring story starts here"
              description="Create your first job to see recruitment trends."
              action={
                <Permission module="jobs" action="create">
                  <Link to="/jobs?create=1" className="text-link">
                    Create a job <ArrowRight size={15} />
                  </Link>
                </Permission>
              }
            />
          )}
          <div className="chart-footer">
            <span>
              <i className="legend-dot" />{" "}
              {chart === "jobs" ? "Job requirements" : "Openings"}
            </span>
            <span>Based on live workspace records</span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Workspace snapshot</h2>
              <p>Your recruitment foundation</p>
            </div>
            <Activity size={18} />
          </div>
          <div className="snapshot-visual">
            <div className="snapshot-ring">
              <strong>{data.openJobs}</strong>
              <span>open jobs</span>
            </div>
            <div className="snapshot-key">
              <div>
                <span className="legend-dot" />
                Open jobs<strong>{data.openJobs}</strong>
              </div>
              <div>
                <span className="legend-dot pale" />
                Other jobs<strong>{data.jobs - data.openJobs}</strong>
              </div>
            </div>
          </div>
          <div className="snapshot-bottom">
            <span>
              <Building2 size={17} /> Active client ratio
            </span>
            <strong>
              {data.clients
                ? Math.round((data.activeClients / data.clients) * 100)
                : 0}
              %
            </strong>
          </div>
          <Permission module="jobs">
            <Link to="/jobs" className="panel-bottom-link">
              Explore your job requirements
              <ArrowUpRight size={16} />
            </Link>
          </Permission>
        </section>
      </div>
      <div className="dashboard-lower">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                Recent job requirements{" "}
                <span className="count-pill">{data.recentJobs.length}</span>
              </h2>
              <p>The latest opportunities in your workspace</p>
            </div>
            <Permission module="jobs">
              <Link to="/jobs" className="text-link">
                View all <ArrowRight size={15} />
              </Link>
            </Permission>
          </div>
          {data.recentJobs.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>JOB TITLE</th>
                    <th>CLIENT / LOCATION</th>
                    <th>OPENINGS</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentJobs.map((job) => (
                    <tr key={job._id}>
                      <td>
                        <Link
                          className="job-title"
                          to={"/jobs?q=" + encodeURIComponent(job.title)}
                        >
                          <span className="job-symbol">
                            <BriefcaseBusiness size={17} />
                          </span>
                          <div>
                            <strong>{job.title}</strong>
                            <small>{job.department || "General"}</small>
                          </div>
                        </Link>
                      </td>
                      <td>
                        {job.client?.companyName}
                        <small>{job.location || "Location not set"}</small>
                      </td>
                      <td>{job.openings}</td>
                      <td>
                        <StatusBadge>{job.status}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Ready for your first requirement"
              description="Add a client, then create a job to start recruiting."
              action={
                <Permission module="clients" action="create">
                  <Link to="/clients?create=1" className="btn secondary">
                    <Plus size={16} />
                    Add a client
                  </Link>
                </Permission>
              }
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent activity</h2>
              <p>A little progress, every day</p>
            </div>
            <span className="live-label">
              <span className="online-dot" /> LIVE
            </span>
          </div>
          {data.activities.length ? (
            <div className="activity-list">
              {data.activities.map((a) => (
                <div className="activity-item" key={a._id}>
                  <div className="activity-icon">
                    <Activity size={15} />
                  </div>
                  <div>
                    <p>
                      <strong>{a.actor?.name || "Team member"}</strong>{" "}
                      {a.action.replaceAll(".", " ")}
                    </p>
                    <small>{new Date(a.createdAt).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="A fresh start"
              description="Workspace activity will appear here as your team gets to work."
            />
          )}
        </section>
      </div>
    </>
  );
}
