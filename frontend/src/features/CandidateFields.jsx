import { useEffect, useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { api, message } from "../services/api";
import { Field } from "../components/ui";

function Suggestions({ field, label, value, setValue, multiple = false }) {
  const id = useId();
  const [query, setQuery] = useState(""),
    [items, setItems] = useState([]),
    [provider, setProvider] = useState("local"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false);
  const search = multiple ? query : value || "";
  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    setError("");
    setBusy(false);
    if (search.trim().length < 2) return () => controller.abort();
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const { data } = await api.get(
          "/candidate-options/" + (multiple ? "skills" : "locations"),
          { params: { q: search.trim() }, signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setItems(data.items);
          setProvider(data.provider);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError(message(e));
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, multiple]);
  const selected = Array.isArray(value) ? value : [];
  function choose(name) {
    if (multiple) {
      if (selected.length >= 50) {
        setError("Select up to 50 skills.");
        return;
      }
      setValue(field, [...selected, name], { shouldDirty: true });
      setQuery("");
    } else setValue(field, name, { shouldDirty: true });
    setOpen(false);
  }
  async function addSkill() {
    try {
      const { data } = await api.post("/candidate-options", {
        kind: "skill",
        name: query.trim(),
      });
      choose(data.name);
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <div
      className="field candidate-autocomplete"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      {multiple && selected.length > 0 && (
        <div className="candidate-tags">
          {selected.map((name) => (
            <span key={name}>
              {name}
              <button
                type="button"
                aria-label={"Remove " + name}
                onClick={() =>
                  setValue(
                    field,
                    selected.filter((s) => s !== name),
                    { shouldDirty: true },
                  )
                }
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        value={search}
        maxLength={80}
        autoComplete="off"
        placeholder={
          multiple ? "Search and select skills?" : "Start typing a city?"
        }
        aria-expanded={open}
        aria-controls={id + "-results"}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && open) {
            e.preventDefault();
            const available = items.filter(
              (i) => !multiple || !selected.includes(i.name),
            );
            if (available[0]) choose(available[0].name);
          }
        }}
        onChange={(e) => {
          setOpen(true);
          if (multiple) setQuery(e.target.value);
          else setValue(field, e.target.value, { shouldDirty: true });
        }}
      />
      {open && search.trim().length >= 2 && (
        <div id={id + "-results"} className="candidate-suggestions">
          {busy && <small role="status">Searching?</small>}
          {items
            .filter((i) => !multiple || !selected.includes(i.name))
            .map((i) => (
              <button
                type="button"
                key={i._id || i.id || i.name}
                onClick={() => choose(i.name)}
              >
                {i.name}
              </button>
            ))}
          {!busy && !items.length && !error && (
            <small>
              No suggestions found.{" "}
              {multiple
                ? "Add a skill below."
                : "You can enter the city manually."}
            </small>
          )}
          {multiple &&
            query.trim().length >= 2 &&
            !selected.some(
              (s) => s.toLowerCase() === query.trim().toLowerCase(),
            ) &&
            !items.some(
              (s) => s.name.toLowerCase() === query.trim().toLowerCase(),
            ) && (
              <button type="button" onClick={addSkill}>
                <Plus size={13} /> Add ?{query.trim()}?
              </button>
            )}
          {!multiple && provider === "google" && items.length > 0 && (
            <img
              className="google-attribution"
              src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
              alt="Powered by Google"
            />
          )}
        </div>
      )}
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
      <small>
        {multiple
          ? "Select multiple skills from your workspace catalog."
          : provider === "google"
            ? "Google Places suggestions"
            : "Indian city suggestions ? Google Places requires configuration"}
      </small>
    </div>
  );
}
function AddOption({ kind, label, items, value, register, setValue, onAdded }) {
  const [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const id = useId();
  async function create() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/candidate-options", {
        kind,
        name: name.trim(),
      });
      onAdded(data);
      setValue(kind === "source" ? "source" : "qualification", data.name, {
        shouldDirty: true,
      });
      setAdding(false);
      setName("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="field">
      <div className="client-field-heading">
        <label htmlFor={id}>{label}</label>
        <button
          type="button"
          className="client-add-option"
          onClick={() => setAdding(!adding)}
        >
          <Plus size={13} />
          Add {label.toLowerCase()}
        </button>
      </div>
      <select id={id} {...register(kind)} value={value || ""}>
        <option value="">Select {label.toLowerCase()}</option>
        {value && !items.some((i) => i.name === value) && (
          <option>{value}</option>
        )}
        {items.map((i) => (
          <option key={i._id} value={i.name}>
            {i.name}
          </option>
        ))}
      </select>
      {adding && (
        <div className="client-inline-option">
          <input
            aria-label={"New " + label.toLowerCase()}
            value={name}
            maxLength={80}
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
              {busy ? "Saving?" : "Save option"}
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
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
export default function CandidateFields({ register, watch, setValue }) {
  const [options, setOptions] = useState({ sources: [], qualifications: [] }),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .get("/candidate-options")
      .then(({ data }) => {
        if (active) setOptions(data);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <Suggestions
        field="currentCity"
        label="Current city"
        value={watch("currentCity")}
        setValue={setValue}
      />
      <Suggestions
        field="preferredLocation"
        label="Preferred location"
        value={watch("preferredLocation")}
        setValue={setValue}
      />
      <AddOption
        kind="qualification"
        label="Qualification"
        items={options.qualifications}
        value={watch("qualification")}
        register={register}
        setValue={setValue}
        onAdded={(item) =>
          setOptions((o) => ({
            ...o,
            qualifications: [...o.qualifications, item],
          }))
        }
      />
      <Field label="Experience">
        <input maxLength={500} {...register("experience")} />
      </Field>
      {[
        ["currentSalary", "Current salary (?)", 12],
        ["expectedSalary", "Expected salary (?)", 12],
        ["noticePeriod", "Notice period (days)", 4],
      ].map(([key, label, max]) => (
        <Field key={key} label={label}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={max}
            {...register(key)}
            onBeforeInput={(e) => {
              if (e.data && /[^0-9]/.test(e.data)) e.preventDefault();
            }}
            onChange={(e) =>
              setValue(key, e.target.value.replace(/[^0-9]/g, ""), {
                shouldDirty: true,
              })
            }
          />
        </Field>
      ))}
      <AddOption
        kind="source"
        label="Candidate source"
        items={options.sources}
        value={watch("source")}
        register={register}
        setValue={setValue}
        onAdded={(item) =>
          setOptions((o) => ({ ...o, sources: [...o.sources, item] }))
        }
      />
      <Suggestions
        field="skills"
        label="Skills"
        value={watch("skills") || []}
        setValue={setValue}
        multiple
      />
    </>
  );
}
