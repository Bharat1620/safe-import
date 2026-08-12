import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { uploadCsv, uploadSample, type UploadResult } from "../api/client";

interface LandingProps {
  onUploaded: (importId: number, jobId: number | null) => void;
}

export function Landing({ onUploaded }: LandingProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  // The API sleeps when idle on free hosting, so the first request can take
  // most of a minute. An unexplained spinner reads as broken; this does not.
  useEffect(() => {
    if (!busy) return setSlow(false);
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [busy]);

  async function start(run: () => Promise<UploadResult>) {
    setBusy(true);
    setError(null);
    try {
      const result = await run();
      onUploaded(result.import_id, result.job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <header className="flex items-baseline gap-3">
        <span className="text-lg font-semibold tracking-tight text-slate-900">
          Safe Import
        </span>
        <Link
          to="/imports"
          className="ml-auto text-sm text-sky-600 underline underline-offset-2"
        >
          Past imports
        </Link>
      </header>

      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">
          Turn a messy CSV into clean data.
        </h1>
        <ul className="flex flex-col gap-1 text-slate-600">
          <li>Columns matched to a fixed schema, with confidence scores</li>
          <li>Every row validated, and fixable in an editable grid</li>
          <li>Commits atomically, or not at all</li>
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void start(() => uploadCsv(file));
          }}
          className={[
            "rounded-xl border-2 border-dashed px-6 py-14 text-sm transition",
            dragging
              ? "border-sky-400 bg-sky-50 text-sky-700"
              : "border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-50",
            busy ? "opacity-60" : "",
          ].join(" ")}
        >
          {busy ? "Working…" : "Drop a CSV here, or click to choose one"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void start(() => uploadCsv(file));
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void start(() => uploadSample(25000))}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Try a sample import
          </button>
          <span className="text-sm text-slate-500">
            No file needed — 25,000 messy rows, processed as a background job.
          </span>
        </div>
      </div>

      {slow && (
        <p className="-mt-4 text-sm text-slate-500">
          The API sleeps when idle on free hosting — waking it can take up to a
          minute. Everything after that is fast.
        </p>
      )}

      {error && (
        <p className="-mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-slate-200 pt-6">
        <h2 className="font-medium text-slate-800">Just want to see the grid?</h2>
        <p className="text-sm text-slate-600">
          500,000 rows with about 40 in the DOM at any moment. Select a range,
          copy, paste, and undo the whole thing with one keystroke.
        </p>
        <Link
          to="/demo"
          className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Open the demo
        </Link>
      </div>
    </div>
  );
}
