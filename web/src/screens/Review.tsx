import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiSource } from "../api/ApiSource";
import {
  commitImport,
  getImport,
  setMapping,
  type CommitResult,
  type ImportInfo,
} from "../api/client";
import { Sheet } from "../sheet/Sheet";
import type { ColumnDef } from "../sheet/types";

const FIELDS = ["full_name", "email", "phone", "company"] as const;

const COLUMNS: ColumnDef[] = [
  { key: "full_name", header: "Full name", width: 200 },
  { key: "email", header: "Email", width: 260 },
  { key: "phone", header: "Phone", width: 180 },
  { key: "company", header: "Company", width: 200 },
];

export function Review({
  importId,
  onDone,
}: {
  importId: number;
  onDone: () => void;
}) {
  const [info, setInfo] = useState<ImportInfo | null>(null);
  const [partial, setPartial] = useState(true);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bumped after remapping so the grid throws away its cache and refetches.
  const [revision, setRevision] = useState(0);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [errorCount, setErrorCount] = useState<number | null>(null);

  useEffect(() => {
    void getImport(importId).then(setInfo).catch(() => {});
  }, [importId]);

  const dataSource = useMemo(
    () => new ApiSource(importId, errorsOnly),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [importId, revision, errorsOnly],
  );

  // Refetched on every edit and remap, since fixing a cell changes the count.
  useEffect(() => {
    void new ApiSource(importId, true)
      .getTotalCount()
      .then(setErrorCount)
      .catch(() => {});
  }, [importId, revision, errorsOnly]);

  const remap = useCallback(
    async (header: string, field: string) => {
      if (!info) return;
      const next = { ...(info.mapping ?? {}) };
      if (field === "") delete next[header];
      else {
        for (const [k, v] of Object.entries(next)) {
          if (v === field) delete next[k];
        }
        next[header] = field;
      }
      setBusy(true);
      try {
        setInfo(await setMapping(importId, next));
        setRevision((r) => r + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not apply the mapping");
      } finally {
        setBusy(false);
      }
    },
    [importId, info],
  );

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      setResult(await commitImport(importId, partial));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return <Committed result={result} onDone={onDone} />;
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-baseline gap-3">
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-sky-600 underline underline-offset-2"
        >
          ← back
        </button>
        <h1 className="font-semibold text-slate-800">
          {info?.filename ?? "Import"}
        </h1>
        <span className="ml-auto text-sm text-slate-500 tabular-nums">
          {info?.total_rows.toLocaleString()} rows
        </span>
      </div>

      {info?.headers && <MappingBar info={info} busy={busy} onChange={remap} />}

      {error && (
        <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 text-sm">
        <span className={errorCount ? "text-rose-700" : "text-slate-500"}>
          {errorCount === null
            ? " "
            : errorCount === 0
              ? "Every row is valid"
              : `${errorCount.toLocaleString()} row${errorCount === 1 ? "" : "s"} need attention`}
        </span>
        {errorCount !== null && errorCount > 0 && (
          <button
            type="button"
            onClick={() => setErrorsOnly((v) => !v)}
            className="rounded border border-slate-300 px-2 py-0.5"
          >
            {errorsOnly ? "Show all rows" : "Show only these"}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <Sheet dataSource={dataSource} columns={COLUMNS} />
      </div>

      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={partial}
            onChange={() => setPartial(true)}
          />
          Import valid rows, list the rest as rejects
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={!partial}
            onChange={() => setPartial(false)}
          />
          Cancel the whole import unless every row is valid
        </label>
        <button
          type="button"
          onClick={() => void commit()}
          disabled={busy}
          className="ml-auto rounded bg-sky-600 px-4 py-1.5 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Committing…" : "Commit"}
        </button>
      </div>
    </div>
  );
}

function MappingBar({
  info,
  busy,
  onChange,
}: {
  info: ImportInfo;
  busy: boolean;
  onChange: (header: string, field: string) => void;
}) {
  // Least confident first — the point of a confidence score is to tell you
  // where to look, not to decorate the row.
  const headers = [...(info.headers ?? [])].sort(
    (a, b) =>
      (info.mapping_confidence?.[a] ?? 0) - (info.mapping_confidence?.[b] ?? 0),
  );

  const unsure = headers.filter(
    (h) => (info.mapping_confidence?.[h] ?? 0) < 0.9,
  ).length;

  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-medium text-slate-700">Column mapping</span>
        <span className="text-slate-500">
          {unsure > 0
            ? `${unsure} suggestion${unsure > 1 ? "s" : ""} worth checking`
            : "all columns matched confidently"}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {headers.map((header) => {
          const confidence = info.mapping_confidence?.[header] ?? 0;
          const review = confidence < 0.9;

          return (
            <label key={header} className="flex items-center gap-2">
              <span
                className={review ? "font-medium text-amber-700" : "text-slate-500"}
              >
                {review && "⚠ "}
                {header}
              </span>
              <span className="text-slate-300">→</span>
              <select
                value={info.mapping?.[header] ?? ""}
                disabled={busy}
                onChange={(e) => onChange(header, e.target.value)}
                className={[
                  "rounded border bg-white px-1 py-0.5",
                  review ? "border-amber-400" : "border-slate-300",
                ].join(" ")}
              >
                <option value="">ignore</option>
                {FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <span className="w-9 text-right text-xs text-slate-400 tabular-nums">
                {Math.round(confidence * 100)}%
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function Committed({
  result,
  onDone,
}: {
  result: CommitResult;
  onDone: () => void;
}) {
  function downloadRejects() {
    const keys = Object.keys(result.rejects[0] ?? {});
    const csv = [
      keys.join(","),
      ...result.rejects.map((r) =>
        keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "rejects.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-24">
      <h2 className="text-lg font-semibold text-slate-800">
        {result.committed > 0
          ? `Imported ${result.committed.toLocaleString()} contacts`
          : "Nothing was imported"}
      </h2>

      {result.rejected > 0 && (
        <>
          <p className="text-sm text-slate-600">
            {result.rejected.toLocaleString()} rows were rejected.
          </p>
          <ul className="max-h-64 overflow-auto rounded border border-slate-200 text-sm">
            {result.rejects.slice(0, 50).map((r, i) => (
              <li key={i} className="border-b border-slate-100 px-3 py-1">
                <span className="text-slate-400 tabular-nums">
                  row {String(r.row)}
                </span>{" "}
                <span className="text-rose-700">{String(r.reason)}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={downloadRejects}
            className="self-start rounded border border-slate-300 px-3 py-1.5 text-sm"
          >
            Download rejects.csv
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onDone}
        className="self-start text-sm text-sky-600 underline underline-offset-2"
      >
        Import another file
      </button>
    </div>
  );
}
