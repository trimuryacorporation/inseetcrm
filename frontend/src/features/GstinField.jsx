import { useId, useRef, useState } from "react";
import { api, message } from "../services/api";
export default function GstinField({
  register,
  watch,
  setValue,
  label = "GSTIN",
}) {
  const id = useId(),
    value = watch("gstin") || "",
    latest = useRef(value);
  latest.current = value;
  const [result, setResult] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function validate() {
    const requested = value.trim().toUpperCase();
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const { data } = await api.post("/validation/gstin", {
        gstin: requested,
      });
      if (latest.current.trim().toUpperCase() === requested) setResult(data);
    } catch (e) {
      if (latest.current.trim().toUpperCase() === requested)
        setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="client-gstin-control">
        <input
          id={id}
          maxLength={15}
          placeholder="15-character GSTIN"
          autoCapitalize="characters"
          spellCheck={false}
          {...register("gstin")}
          onChange={(e) => {
            setValue("gstin", e.target.value.toUpperCase(), {
              shouldDirty: true,
            });
            setResult(null);
            setError("");
          }}
        />
        <button
          type="button"
          className="btn secondary"
          disabled={!value.trim() || busy}
          onClick={validate}
        >
          {busy ? "Checking..." : "Validate"}
        </button>
      </div>
      {error && (
        <small role="alert" className="error-text">
          {error}
        </small>
      )}
      {result && (
        <div
          className={
            "client-gstin-result " + (result.valid ? "valid" : "invalid")
          }
          role="status"
        >
          <strong>
            {result.valid ? "Format & checksum valid" : "Invalid GSTIN"}
          </strong>
          <p>{result.message}</p>
          {result.valid && (
            <a
              href={result.portalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Check registration on GST Portal
            </a>
          )}
        </div>
      )}
    </div>
  );
}
