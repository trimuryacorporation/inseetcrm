import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAuth } from "../store/auth";
import { api, message } from "../services/api";
export default function DepartmentField({ register, watch, setValue }) {
  const id = useId(),
    value = watch("department") || "",
    role = useAuth((s) => s.user?.role),
    canAdd = ["Super Admin", "Admin", "HR Manager", "Team Leader"].includes(
      role,
    );
  const [query, setQuery] = useState(""),
    [items, setItems] = useState([]),
    [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get("/departments", {
          params: { q: query, limit: 100 },
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setItems(data.items);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(message(e));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, refresh]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/departments", { name: name.trim() });
      setValue("department", data.name, { shouldDirty: true });
      setItems((i) => [data, ...i.filter((v) => v._id !== data._id)]);
      setName("");
      setAdding(false);
      setQuery("");
      setRefresh((i) => i + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="field">
      <div className="client-field-heading">
        <label htmlFor={id}>Department</label>
        {canAdd && (
          <button
            type="button"
            className="client-add-option"
            onClick={() => setAdding(!adding)}
          >
            <Plus size={13} />
            Add department
          </button>
        )}
      </div>
      <input
        aria-label="Search departments"
        value={query}
        maxLength={100}
        placeholder="Search departments..."
        onChange={(e) => setQuery(e.target.value)}
      />
      <select
        id={id}
        {...register("department")}
        value={value}
        onFocus={() => setRefresh((i) => i + 1)}
      >
        <option value="">
          {loading ? "Loading departments..." : "Select a department"}
        </option>
        {value && !items.some((i) => i.name === value) && (
          <option value={value}>{value}</option>
        )}
        {items.map((i) => (
          <option key={i._id} value={i.name}>
            {i.name}
          </option>
        ))}
      </select>
      {!loading && !items.length && (
        <small>
          No matching departments.{" "}
          {canAdd
            ? "Add a department above."
            : "Ask your HR manager to add one."}
        </small>
      )}
      {adding && (
        <div className="client-inline-option">
          <input
            aria-label="New department name"
            value={name}
            maxLength={120}
            placeholder="Department name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (name.trim().length >= 2 && !busy) create();
              }
            }}
          />
          <div className="client-inline-option-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy || name.trim().length < 2}
              onClick={create}
            >
              {busy ? "Saving..." : "Save department"}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <small className="error-text" role="alert">
          {error}
        </small>
      )}
      <Link to="/departments" className="client-add-option">
        Manage departments
      </Link>
    </div>
  );
}
