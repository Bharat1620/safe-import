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
  onDone: (to: "upload" | "imports") => void;
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
  const [edited, setEdited] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void getImport(importId).then(setInfo).catch(() => {});
  }, [importId]);

  const dataSource = useMemo(
    () =>
      new ApiSource(importId, {
        errorsOnly,
        onErrorCount: setErrorCount,
        onSaved: () => {
          setEdited(true);
          setSaveError(null);
        },
        onSaveError: setSaveError,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [importId, revision, errorsOnly],
  );

  const remap = useCallback(
    async (header: string, field: string) => {
      if (!info) return;
      // Remapping re-stages the file from the original CSV, so anything edited
      // since upload is rebuilt from scratch and lost.
      if (
        edited &&
        !window.confirm(
          "Changing the mapping re-reads the file, which discards the cell edits you have made. Continue?",
        )
      ) {
        return;
      }
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
    const total = info?.total_rows ?? 0;
    const bad = errorCount ?? 0;
    const message = partial
      ? `Import ${(total - bad).toLocaleString()} rows and reject ${bad.toLocaleString()}? This cannot be undone.`
      : bad > 0
        ? `${bad.toLocaleString()} rows are invalid, so nothing will be imported. Continue?`
        : `Import all ${total.toLocaleString()} rows? This cannot be undone.`;
    if (!window.confirm(message)) return;

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

  const committed = info?.status === "committed";

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-baseline gap-3">
        <button
          type="button"
          onClick={() => onDone("imports")}
          className="text-sm text-sky-600 underline underline-offset-2"
        >
          Imports
        </button>
        <span className="text-slate-300">/</span>
        <h1 className="font-semibold text-slate-900">
          {info?.filename ?? "Import"}
        </h1>
        <span className="ml-auto text-sm text-slate-500 tabular-nums">
          {info?.total_rows.toLocaleString()} rows
        </span>
      </header>

      {committed && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          This import has been committed. Its rows are read-only.
        </p>
      )}

      {info?.headers && (
        <MappingBar info={info} busy={busy || committed} onChange={remap} />
      )}

      {(error || saveError) && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error ?? `${saveError} — your change was not saved.`}
        </p>
      )}

      <div className="flex items-center gap-3 text-sm">
        <span
          className={
            errorCount ? "font-medium text-rose-700" : "text-slate-500"
          }
        >
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
            className={[
              "rounded-md border px-2 py-0.5",
              errorsOnly
                ? "border-rose-300 bg-rose-50 text-rose-700"
                : "border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            {errorsOnly ? "Showing errors only" : "Show only these"}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <Sheet
          dataSource={dataSource}
          columns={COLUMNS}
          readOnly={committed}
        />
      </div>

      {!committed && (
        <div className="flex items-center gap-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <label className="flex items-center gap-2 text-slate-700">
            <input
              type="radio"
              checked={partial}
              onChange={() => setPartial(true)}
            />
            Import valid rows, list the rest as rejects
          </label>
          <label className="flex items-center gap-2 text-slate-700">
            <input
              type="radio"
              checked={!partial}
              onChange={() => setPartial(false)}
            />
            Cancel everything unless every row is valid
          </label>
          <button
            type="button"
            onClick={() => void commit()}
            disabled={busy}
            className="ml-auto rounded-md bg-sky-600 px-4 py-1.5 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? "Committing…" : "Commit"}
          </button>
        </div>
      )}
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
  const confidenceOf = (h: string) => info.mapping_confidence?.[h] ?? 0;
  const sorted = [...(info.headers ?? [])].sort(
    (a, b) => confidenceOf(a) - confidenceOf(b),
  );

  // Split rather than only sorted: in a wrapping row "first" just means
  // leftmost, which reads as nothing. A separate group is the actual signal.
  const unsure = sorted.filter((h) => confidenceOf(h) < 0.9);
  const confident = sorted.filter((h) => confidenceOf(h) >= 0.9);

  const field = (header: string) => {
    const confidence = confidenceOf(header);
    const review = confidence < 0.9;

    return (
      <label key={header} className="flex items-center gap-2">
        <span className={review ? "font-medium text-amber-800" : "text-slate-500"}>
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
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      {unsure.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
          <span className="font-medium text-amber-800">
            {unsure.length} column{unsure.length > 1 ? "s" : ""} worth checking
          </span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {unsure.map(field)}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="font-medium text-slate-700">
          {unsure.length > 0
            ? "Matched confidently"
            : "Column mapping — all columns matched confidently"}
        </span>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {confident.map(field)}
        </div>
      </div>
    </div>
  );
}

function Committed({
  result,
  onDone,
}: {
  result: CommitResult;
  onDone: (to: "upload" | "imports") => void;
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

  const committed = result.committed > 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 py-20">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-slate-900">
          {committed
            ? `Imported ${result.committed.toLocaleString()} contact${result.committed === 1 ? "" : "s"}`
            : "Nothing was imported"}
        </h2>
        <p className="text-slate-600">
          {result.rejected === 0
            ? "Every row was valid."
            : committed
              ? `${result.rejected.toLocaleString()} rows were rejected and left out.`
              : `All ${result.rejected.toLocaleString()} rows were rejected, so the import was rolled back.`}
        </p>
      </div>

      {result.rejected > 0 && (
        <>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 text-sm">
            {result.rejects.slice(0, 50).map((r, i) => (
              <li key={i} className="flex gap-3 px-3 py-1.5">
                <span className="w-16 shrink-0 text-slate-400 tabular-nums">
                  row {String(r.row)}
                </span>
                <span className="text-rose-700">{String(r.reason)}</span>
              </li>
            ))}
          </ul>
          {result.rejects.length > 50 && (
            <p className="-mt-3 text-xs text-slate-400">
              Showing the first 50. The download has all{" "}
              {result.rejected.toLocaleString()}.
            </p>
          )}
          <button
            type="button"
            onClick={downloadRejects}
            className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Download rejects.csv
          </button>
        </>
      )}

      <div className="flex gap-4 border-t border-slate-200 pt-5 text-sm">
        <button
          type="button"
          onClick={() => onDone("upload")}
          className="rounded-md bg-sky-600 px-4 py-1.5 font-medium text-white hover:bg-sky-700"
        >
          Import another file
        </button>
        <button
          type="button"
          onClick={() => onDone("imports")}
          className="text-sky-600 underline underline-offset-2"
        >
          View all imports
        </button>
      </div>
    </div>
  );
}
