import { usePermission } from "../utils/permissions";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, X } from "lucide-react";
import { api, message } from "../services/api";
export default function DepartmentField({
  register,
  watch,
  setValue,
  required = false,
}) {
  const id = useId(),
    value = watch("department") || "",
    canAdd = usePermission("departments", "create");
  const [query, setQuery] = useState(""),
    [items, setItems] = useState([]),
    [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [searching, setSearching] = useState(false);
  const registration = register("department");
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
    <div className="field department-picker">
      <div className="client-field-heading">
        <label htmlFor={id}>Department{required ? " *" : ""}</label>
        <div className="department-picker-actions">
          <button
            type="button"
            className="department-search-toggle"
            aria-label="Search departments"
            aria-expanded={searching}
            onClick={() => {
              setSearching(!searching);
              setQuery("");
            }}
          >
            <Search size={14} />
          </button>
          {canAdd && (
            <button
              type="button"
              className="client-add-option"
              onClick={() => setAdding(!adding)}
            >
              <Plus size={13} />
              Add new
            </button>
          )}
        </div>
      </div>
      {searching && (
        <div className="department-search-input">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label="Search departments"
            value={query}
            maxLength={100}
            placeholder="Search departments..."
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
              if (e.key === "Escape") {
                e.stopPropagation();
                setSearching(false);
                setQuery("");
              }
            }}
          />
          <button
            type="button"
            aria-label="Close department search"
            onClick={() => {
              setSearching(false);
              setQuery("");
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <select
        id={id}
        required={required}
        {...registration}
        onChange={(e) => {
          registration.onChange(e);
          setSearching(false);
          setQuery("");
        }}
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
