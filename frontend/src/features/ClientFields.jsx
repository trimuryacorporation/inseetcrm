import { useEffect, useId, useRef, useState } from "react";
import { Plus, Check, ShieldCheck, ExternalLink, X } from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import { Field } from "../components/ui";
export function fixedFeeToPaise(input) {
  const value = String(input ?? "").trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a fixed fee with no more than two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const paise = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
  if (paise > 1000000000000) throw new Error("Fixed fee is too large.");
  return paise;
}
function MasterSelect({
  label,
  field,
  items,
  value,
  register,
  setValue,
  onChange,
  onAdd,
  kind,
  canManage,
  disabled,
  placeholder,
  addDisabled = false,
}) {
  const id = useId();
  const [adding, setAdding] = useState(false),
    [name, setName] = useState(""),
    [feeType, setFeeType] = useState("percentage"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const registration = register(field);
  async function create() {
    setError("");
    if (name.trim().length < 2) {
      setError("Enter at least two characters.");
      return;
    }
    setBusy(true);
    try {
      const option = await onAdd(kind, name.trim(), feeType);
      setValue(field, option.name, { shouldDirty: true, shouldValidate: true });
      onChange?.(option.name);
      setAdding(false);
      setName("");
      toast.success(label + " added");
    } catch (e) {
      setError(e.response ? message(e) : e.message || "Could not add option");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="field client-master-field">
      <div className="client-field-heading">
        <label htmlFor={id}>{label}</label>
        {canManage && (
          <button
            type="button"
            className="client-add-option"
            disabled={disabled || addDisabled || busy}
            onClick={() => {
              setError("");
              setAdding(!adding);
            }}
          >
            <Plus size={13} />
            Add{" "}
            {kind === "paymentModel"
              ? "model"
              : kind === "industry"
                ? "industry"
                : kind}
          </button>
        )}
      </div>
      <select
        id={id}
        {...registration}
        value={value || ""}
        disabled={disabled}
        onChange={(e) => {
          registration.onChange(e);
          onChange?.(e.target.value);
        }}
      >
        <option value="">
          {placeholder || "Select " + label.toLowerCase()}
        </option>
        {value && !items.some((option) => option.name === value) && (
          <option value={value}>{value}</option>
        )}
        {items.map((option) => (
          <option key={option._id || option.name} value={option.name}>
            {option.name}
          </option>
        ))}
      </select>
      {adding && !disabled && !addDisabled && (
        <div className="client-inline-option">
          <label className="sr-only" htmlFor={id + "-new"}>
            New {label.toLowerCase()}
          </label>
          <input
            id={id + "-new"}
            value={name}
            maxLength={120}
            placeholder={
              "New " +
              (kind === "paymentModel" ? "payment model" : kind) +
              " name"
            }
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
            }}
          />
          {kind === "paymentModel" && (
            <select
              aria-label="New payment model fee type"
              value={feeType}
              onChange={(e) => setFeeType(e.target.value)}
              disabled={busy}
            >
              <option value="percentage">Percentage-based fee</option>
              <option value="fixed">Fixed amount (₹)</option>
            </select>
          )}
          <div className="client-inline-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={create}
            >
              <Check size={14} />
              {busy ? "Adding…" : "Add & select"}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Cancel new option"
              disabled={busy}
              onClick={() => setAdding(false)}
            >
              <X size={16} />
            </button>
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
export default function ClientFields({ register, watch, setValue }) {
  const [masters, setMasters] = useState(null),
    [loadError, setLoadError] = useState(""),
    [cities, setCities] = useState([]),
    [cityBusy, setCityBusy] = useState(false),
    [cityError, setCityError] = useState(""),
    [gstResult, setGstResult] = useState(null),
    [gstBusy, setGstBusy] = useState(false);
  const selectedState = watch("state") || "",
    selectedModel = watch("paymentTerms") || "",
    gstin = watch("gstin") || "";
  const latestState = useRef(selectedState);
  latestState.current = selectedState;
  const latestGst = useRef(gstin);
  latestGst.current = gstin;
  async function load() {
    setLoadError("");
    try {
      setMasters((await api.get("/client-options")).data);
    } catch (e) {
      setLoadError(message(e));
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    let active = true;
    setCities([]);
    setCityError("");
    if (!selectedState) {
      setCityBusy(false);
      return;
    }
    setCityBusy(true);
    api
      .get("/client-options/cities", { params: { state: selectedState } })
      .then((r) => {
        if (active) setCities(r.data.items);
      })
      .catch((e) => {
        if (active) setCityError(message(e));
      })
      .finally(() => {
        if (active) setCityBusy(false);
      });
    return () => {
      active = false;
    };
  }, [selectedState]);
  const model = masters?.paymentModels.find(
    (option) => option.name === selectedModel,
  );
  const fixed = model?.feeType === "fixed";
  useEffect(() => {
    setValue("feeType", fixed ? "fixed" : "percentage");
  }, [fixed, setValue]);
  useEffect(() => {
    setGstResult(null);
  }, [gstin]);
  async function addOption(kind, name, feeType) {
    const stateAtRequest = selectedState;
    const response = await api.post("/client-options", {
      kind,
      name,
      ...(kind === "city" ? { state: stateAtRequest } : {}),
      ...(kind === "paymentModel" ? { feeType } : {}),
    });
    const option = response.data;
    if (kind === "city" && latestState.current !== stateAtRequest)
      throw new Error(
        "City saved under the previous state. Select that state to use it.",
      );
    if (kind === "city")
      setCities((items) =>
        [...items, option].sort((a, b) => a.name.localeCompare(b.name)),
      );
    else {
      const key = {
        industry: "industries",
        state: "states",
        paymentModel: "paymentModels",
      }[kind];
      setMasters((current) => ({
        ...current,
        [key]: [...current[key], option].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      }));
    }
    return option;
  }
  async function checkGstin() {
    const value = gstin.trim().toUpperCase();
    setGstBusy(true);
    try {
      const result = (
        await api.post("/client-options/gstin/validate", { gstin: value })
      ).data;
      if (latestGst.current.trim().toUpperCase() === value)
        setGstResult(result);
    } catch (e) {
      toast.error(message(e));
    } finally {
      setGstBusy(false);
    }
  }
  const select = (label, field, items, kind, extra = {}) => (
    <MasterSelect
      label={label}
      field={field}
      items={items || []}
      kind={kind}
      value={watch(field) || ""}
      register={register}
      setValue={setValue}
      onAdd={addOption}
      canManage={masters?.canManage}
      disabled={!masters}
      {...extra}
    />
  );
  return (
    <>
      {loadError && (
        <div className="client-form-alert" role="alert">
          <p>{loadError}</p>
          <button type="button" className="text-link" onClick={load}>
            Retry loading options
          </button>
        </div>
      )}
      <Field label="Company name *">
        <input
          required
          minLength={2}
          maxLength={200}
          autoComplete="organization"
          {...register("companyName")}
        />
      </Field>
      {select("Industry", "industry", masters?.industries, "industry")}
      <Field label="Contact person">
        <input
          maxLength={300}
          autoComplete="name"
          {...register("contactPerson")}
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          maxLength={300}
          autoComplete="email"
          {...register("email")}
        />
      </Field>
      <Field label="Phone">
        <input
          type="tel"
          maxLength={30}
          autoComplete="tel"
          {...register("phone")}
        />
      </Field>
      <Field label="Website">
        <input
          type="url"
          maxLength={300}
          placeholder="https://company.com"
          {...register("website")}
        />
      </Field>
      {select("State / Union territory", "state", masters?.states, "state", {
        onChange: () => setValue("city", "", { shouldDirty: true }),
        placeholder: masters ? "Select a state" : "Loading states…",
      })}
      <div>
        {select("City", "city", cities, "city", {
          disabled: !selectedState || cityBusy || !masters,
          addDisabled: !selectedState,
          placeholder: !selectedState
            ? "Select a state first"
            : cityBusy
              ? "Loading cities…"
              : "Select a city",
        })}
        {cityError && (
          <p className="error-text" role="alert">
            {cityError}
          </p>
        )}
        {selectedState && !cityBusy && !cityError && (
          <p className="client-location-note">
            {cities.length} cities available · Add a missing city above
          </p>
        )}
      </div>
      <div className="field">
        <label className="client-standard-label" htmlFor="client-gstin">
          GSTIN
        </label>
        <div className="client-gstin-control">
          <input
            id="client-gstin"
            maxLength={15}
            placeholder="15-character GSTIN"
            autoCapitalize="characters"
            spellCheck={false}
            {...register("gstin", {
              setValueAs: (value) =>
                String(value || "")
                  .trim()
                  .toUpperCase(),
            })}
          />
          <button
            type="button"
            className="btn secondary"
            disabled={!gstin.trim() || gstBusy}
            onClick={checkGstin}
          >
            <ShieldCheck size={14} />
            {gstBusy ? "Checking…" : "Validate"}
          </button>
        </div>
        {gstResult && (
          <div
            className={
              "client-gstin-result " + (gstResult.valid ? "valid" : "invalid")
            }
            role="status"
          >
            <strong>
              {gstResult.valid ? "Format & checksum valid" : "Invalid GSTIN"}
            </strong>
            <p>{gstResult.message}</p>
            {gstResult.valid && (
              <a
                href={gstResult.portalUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Check registration on GST Portal
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        )}
      </div>
      {select(
        "Payment terms / Fee model",
        "paymentTerms",
        masters?.paymentModels,
        "paymentModel",
      )}
      <Field
        label={
          fixed
            ? "Fixed fee per joining (₹) *"
            : model?.basis === "monthlySalary"
              ? "Placement fee (% of monthly salary)"
              : model?.basis === "annualCTC"
                ? "Placement fee (% of annual CTC)"
                : "Placement fee (%)"
        }
      >
        {fixed ? (
          <input
            key="fixed"
            type="number"
            min="0"
            step="0.01"
            max="10000000000"
            required
            placeholder="e.g. 5000.00"
            {...register("fixedFee")}
          />
        ) : (
          <input
            key="percentage"
            type="number"
            min="0"
            max="1000"
            step="0.01"
            placeholder="e.g. 8.33"
            {...register("placementFee")}
          />
        )}
      </Field>
    </>
  );
}
