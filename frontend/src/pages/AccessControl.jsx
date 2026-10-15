import { useEffect, useState } from "react";
import { ShieldCheck, Save, RotateCcw, Users, Building2 } from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import { LoadingSkeleton, ErrorState } from "../components/ui";
export default function AccessControl() {
  const [targets, setTargets] = useState(null),
    [type, setType] = useState("user"),
    [id, setId] = useState(""),
    [rules, setRules] = useState({}),
    [inherited, setInherited] = useState({}),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [dirty, setDirty] = useState(false);
  async function loadTargets() {
    try {
      setError("");
      setTargets((await api.get("/access-control/targets")).data);
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    loadTargets();
  }, []);
  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setError("");
    api
      .get("/access-control/" + type + "/" + id)
      .then((r) => {
        if (active) {
          setRules(r.data.rules);
          setInherited(r.data.inherited);
          setDirty(false);
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [type, id]);
  function change(module, action, value) {
    setDirty(true);
    setRules((old) => {
      const next = { ...old, [module]: { ...old[module] } };
      if (value === "inherit") delete next[module][action];
      else next[module][action] = value === "allow";
      if (!Object.keys(next[module]).length) delete next[module];
      return next;
    });
  }
  async function save() {
    setSaving(true);
    try {
      await api.put("/access-control/" + type + "/" + id, { rules });
      setDirty(false);
      toast.success("Permissions saved");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setSaving(false);
    }
  }
  if (!targets)
    return error ? (
      <ErrorState error={error} retry={loadTargets} />
    ) : (
      <LoadingSkeleton />
    );
  const items = (type === "user" ? targets.users : targets.departments).filter(
    (x) =>
      (x.name + " " + (x.email || "") + " " + (x.department || ""))
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const selected = (type === "user" ? targets.users : targets.departments).find(
    (x) => x._id === id,
  );
  const switchTarget = (nextType, nextId = "") => {
    if (dirty && !window.confirm("Discard unsaved permission changes?")) return;
    setType(nextType);
    setId(nextId);
    setRules({});
    setDirty(false);
    setQuery("");
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SUPER ADMIN CONTROL</div>
          <h1>
            Access & permissions<span className="heading-dot">.</span>
          </h1>
          <p>Choose who can view, create, edit and delete records.</p>
        </div>
        <ShieldCheck className="text-violet-500" size={32} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="panel p-4 self-start">
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              ["user", "Users", Users],
              ["department", "Departments", Building2],
            ].map(([value, label, Icon]) => (
              <button
                key={value}
                className={
                  "btn justify-center " +
                  (type === value ? "primary" : "secondary")
                }
                onClick={() => switchTarget(value)}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <label
            className="block text-xs text-slate-500 mb-2"
            htmlFor="access-search"
          >
            Search {type === "user" ? "employees" : "departments"}
          </label>
          <input
            id="access-search"
            className="w-full rounded-lg border border-slate-200 bg-transparent p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="mt-3 max-h-[520px] overflow-y-auto space-y-1">
            {items.map((x) => (
              <button
                key={x._id}
                onClick={() => switchTarget(type, x._id)}
                className={
                  "w-full text-left rounded-xl p-3 transition " +
                  (id === x._id
                    ? "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200"
                    : "hover:bg-slate-100 dark:hover:bg-white/5")
                }
              >
                <span className="block text-sm font-semibold">{x.name}</span>
                {type === "user" && (
                  <>
                    <span className="block text-xs opacity-70 break-all mt-1">
                      {x.email}
                    </span>
                    <span className="block text-xs opacity-70 mt-1">
                      {x.department || "No department"} &middot; {x.role}
                      {x.active ? "" : " (inactive)"}
                    </span>
                  </>
                )}
              </button>
            ))}
            {!items.length && (
              <p className="p-3 text-sm text-slate-500">No matching records.</p>
            )}
          </div>
        </aside>
        <section className="panel min-w-0 overflow-hidden">
          {!id ? (
            <div className="p-12 text-center">
              <ShieldCheck className="mx-auto text-violet-400 mb-4" size={40} />
              <h2 className="font-semibold">Select a user or department</h2>
              <p className="mt-2 text-sm text-slate-500">
                Department rules apply to its members. User rules take priority.
              </p>
            </div>
          ) : loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <div className="p-6">
              <ErrorState error={error} retry={() => switchTarget(type, "")} />
            </div>
          ) : (
            <>
              <div className="p-5 border-b border-slate-200 dark:border-white/10">
                <h2 className="font-semibold">{selected?.name}</h2>
                <p className="text-sm text-slate-500 mt-2">
                  {type === "user"
                    ? "Inherit uses the department rule, then the access role."
                    : "Inherit keeps each employee access role defaults."}{" "}
                  View must be allowed to use any other action.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-white/5">
                    <tr>
                      <th className="text-left p-4 min-w-[160px]">Module</th>
                      {targets.actions.map((a) => (
                        <th className="p-3 text-left capitalize" key={a}>
                          {a}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(targets.modules).map(([key, label]) => (
                      <tr
                        key={key}
                        className="border-t border-slate-100 dark:border-white/10"
                      >
                        <td className="p-4 font-medium">{label}</td>
                        {targets.actions.map((a) => (
                          <td key={a} className="p-2">
                            <select
                              aria-label={label + " " + a}
                              className={
                                "rounded-lg border px-2 py-2 text-xs bg-transparent focus:ring-2 focus:ring-violet-400 " +
                                (rules[key]?.[a] === true
                                  ? "border-emerald-300 text-emerald-700 dark:text-emerald-300"
                                  : rules[key]?.[a] === false
                                    ? "border-rose-300 text-rose-600 dark:text-rose-300"
                                    : "border-slate-200 text-slate-500")
                              }
                              value={
                                rules[key]?.[a] === undefined
                                  ? "inherit"
                                  : rules[key][a]
                                    ? "allow"
                                    : "deny"
                              }
                              onChange={(e) => change(key, a, e.target.value)}
                            >
                              <option value="inherit">
                                Inherit
                                {type === "user"
                                  ? " (" +
                                    (inherited[key]?.[a]
                                      ? "allowed"
                                      : "blocked") +
                                    ")"
                                  : ""}
                              </option>
                              <option value="allow">Allow</option>
                              <option value="deny">Block</option>
                            </select>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap justify-between gap-3 p-5 border-t border-slate-200 dark:border-white/10">
                <button
                  className="btn secondary"
                  disabled={saving}
                  onClick={() => {
                    setRules({});
                    setDirty(true);
                  }}
                >
                  <RotateCcw size={15} />
                  Reset to inherited
                </button>
                <button
                  className="btn primary"
                  disabled={saving || !dirty}
                  onClick={save}
                >
                  <Save size={16} />
                  {saving ? "Saving..." : "Save permissions"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Changes apply to existing sessions immediately. Record ownership, portal
        isolation and protected account administration remain enforced. Super
        Admin always retains full access.
      </p>
    </>
  );
}
