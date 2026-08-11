import { useEffect, useRef, useState } from "react";
import { uploadCsv, uploadSample, type UploadResult } from "../api/client";

interface UploadProps {
  onUploaded: (importId: number, jobId: number | null) => void;
  onDemo: () => void;
  onImports: () => void;
}

export function Upload({ onUploaded, onDemo, onImports }: UploadProps) {
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

  const send = (file: File) => start(() => uploadCsv(file));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-16">
      <header className="flex items-baseline gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Safe Import</h1>
        <button
          type="button"
          onClick={onImports}
          className="ml-auto text-sm text-sky-600 underline underline-offset-2"
        >
          Past imports
        </button>
      </header>

      <p className="text-slate-600">
        Drop a messy CSV of contacts. Columns are matched to a fixed schema,
        every row is validated, and nothing is written until you commit.
      </p>

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
          if (file) void send(file);
        }}
        className={[
          "rounded-xl border-2 border-dashed px-6 py-16 text-sm transition",
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
          if (file) void send(file);
        }}
      />

      {slow && (
        <p className="text-sm text-slate-500">
          The API sleeps when idle on free hosting — waking it can take up to a
          minute. Everything after that is fast.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5 border-t border-slate-200 pt-5 text-sm text-slate-500">
        <p>
          No file to hand?{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => void start(uploadSample)}
            className="text-sky-600 underline underline-offset-2 disabled:opacity-50"
          >
            Try a sample import
          </button>{" "}
          — deliberately messy, with unnamed columns for the mapper to work out.
        </p>
        <p>
          Or{" "}
          <button
            type="button"
            onClick={onDemo}
            className="text-sky-600 underline underline-offset-2"
          >
            open the 500,000 row grid
          </button>{" "}
          — no upload, no backend.
        </p>
      </div>
    </div>
  );
}
