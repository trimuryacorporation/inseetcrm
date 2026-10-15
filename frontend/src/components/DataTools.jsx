import {usePermission} from '../utils/permissions';
﻿import { useRef, useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import toast from "react-hot-toast";
import { api, message } from "../services/api";
import { FormModal } from "./ui";
export default function DataTools({ resource, onImported }) {
  const canCreate = usePermission(resource,"create");
  const input = useRef();
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState(null);
  async function exportFile() {
    setBusy(true);
    try {
      const r = await api.get("/data/" + resource + "/export?format=xlsx", {
        responseType: "blob",
      });
      const url = URL.createObjectURL(r.data),
        a = document.createElement("a");
      a.href = url;
      a.download = "inseet-" + resource + ".xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(
        "Could not export this spreadsheet. Check your access and API connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file) {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const r = await api.post("/data/candidates/import", body);
      setResult(r.data);
      onImported?.();
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <button className="btn secondary" disabled={busy} onClick={exportFile}>
        <FileSpreadsheet size={16} />
        {busy ? "Working…" : "XLSX"}
      </button>
      {resource === "candidates" && canCreate && (
        <>
          <input
            ref={input}
            type="file"
            hidden
            accept=".csv,.xlsx"
            onChange={(e) => importFile(e.target.files[0])}
          />
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => input.current.click()}
          >
            <Upload size={16} />
            Import
          </button>
          <a
            className="text-link"
            href="/candidate-import-template.csv"
            download
          >
            Template
          </a>
        </>
      )}
      {result && (
        <FormModal
          title="Candidate import results"
          onClose={() => setResult(null)}
        >
          <div className="p-6">
            <p className="mb-5">
              {result.imported} imported · {result.failed} skipped
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ROW</th>
                    <th>RESULT</th>
                    <th>DETAILS</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.status}</td>
                      <td className="import-error-cell">
                        {r.message || "Candidate added"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </FormModal>
      )}
    </>
  );
}
