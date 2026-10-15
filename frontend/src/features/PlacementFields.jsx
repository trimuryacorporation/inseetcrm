import { useEffect, useId, useState } from "react";
import { api, message } from "../services/api";
function RecordSelect({
  kind,
  field,
  nameField,
  label,
  register,
  watch,
  setValue,
  errors,
  client,
  onSelect,
}) {
  const id = useId(),
    selected = watch(field) || "",
    name = watch(nameField) || "";
  const [query, setQuery] = useState(""),
    [items, setItems] = useState([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [active, setActive] = useState(0);
  const disabled = kind === "jobs" && !client;
  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    setActive(0);
    setError("");
    setBusy(false);
    if (!open || disabled) return () => controller.abort();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const { data } = await api.get("/placements/options", {
          params: {
            kind,
            q: query,
            client: kind === "jobs" ? client : undefined,
          },
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setItems(data.items);
      } catch (e) {
        if (!controller.signal.aborted) setError(message(e));
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, kind, client, open, disabled]);
  function choose(item) {
    setValue(field, item._id, { shouldDirty: true, shouldValidate: true });
    setValue(nameField, item.name, { shouldDirty: true });
    setQuery("");
    setOpen(false);
    onSelect?.(item);
  }
  return (
    <div
      className="field candidate-autocomplete"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label} *</label>
      <input
        type="hidden"
        {...register(field, {
          required: "Select " + label.toLowerCase() + " from the dropdown.",
        })}
      />
      <input type="hidden" {...register(nameField)} />
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={id + "-list"}
        aria-expanded={open}
        aria-activedescendant={
          open && items[active] ? id + "-" + active : undefined
        }
        aria-invalid={!!errors[field]}
        disabled={disabled}
        autoComplete="off"
        value={open ? query : name}
        placeholder={
          disabled ? "Select a client first" : "Search and select..."
        }
        maxLength={100}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, items.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          }
          if (e.key === "Enter" && open) {
            e.preventDefault();
            if (items[active]) choose(items[active]);
          }
        }}
      />
      {open && !disabled && (
        <div
          id={id + "-list"}
          role="listbox"
          aria-label={label}
          className="candidate-suggestions"
        >
          {busy && <small role="status">Loading records...</small>}
          {items.map((item, index) => (
            <button
              type="button"
              role="option"
              id={id + "-" + index}
              aria-selected={selected === item._id}
              key={item._id}
              onClick={() => choose(item)}
              className={index === active ? "placement-option-active" : ""}
            >
              <span>
                {item.name}
                <small>
                  {[item.detail, "ID " + item._id.slice(-6)]
                    .filter(Boolean)
                    .join(" | ")}
                </small>
              </span>
            </button>
          ))}
          {!busy && !items.length && !error && (
            <small>
              No matching records. Add the record in its module first.
            </small>
          )}
          {error && (
            <small role="alert" className="error-text">
              {error}
            </small>
          )}
        </div>
      )}
      {errors[field] && (
        <small className="error-text" role="alert">
          {errors[field].message}
        </small>
      )}
      {!open && selected && <small>Selected ID: {selected.slice(-6)}</small>}
    </div>
  );
}
export default function PlacementFields(props) {
  const { watch, setValue } = props;
  return (
    <>
      <RecordSelect
        {...props}
        kind="candidates"
        field="candidate"
        nameField="candidateName"
        label="Candidate name"
      />
      <RecordSelect
        {...props}
        kind="clients"
        field="client"
        nameField="companyName"
        label="Client company"
        onSelect={() => {
          setValue("job", "", { shouldDirty: true });
          setValue("jobTitle", "", { shouldDirty: true });
        }}
      />
      <RecordSelect
        {...props}
        kind="jobs"
        field="job"
        nameField="jobTitle"
        label="Job title"
        client={watch("client")}
      />
    </>
  );
}
