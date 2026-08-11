import { useEffect, useRef, useState } from "react";
import { uploadCsv } from "../api/client";

interface UploadProps {
  onUploaded: (importId: number, jobId: number | null) => void;
  onDemo: () => void;
}

export function Upload({ onUploaded, onDemo }: UploadProps) {
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

  async function send(file: File) {
    setBusy(true);
    setError(null);
    try {
      const result = await uploadCsv(file);
      onUploaded(result.import_id, result.job_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-16">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Safe Import</h1>
        <p className="text-sm text-slate-500">
          Drop a CSV of contacts. Nothing is written until you commit.
        </p>
      </div>

      <button
        type="button"
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
          "rounded-lg border-2 border-dashed px-6 py-16 text-sm transition",
          dragging
            ? "border-sky-400 bg-sky-50 text-sky-700"
            : "border-slate-300 text-slate-500 hover:border-slate-400",
        ].join(" ")}
      >
        {busy ? "Uploading…" : "Drop a CSV here, or click to choose one"}
      </button>

      {slow && (
        <p className="text-sm text-slate-500">
          The API sleeps when idle on free hosting — waking it up can take up to
          a minute. Later requests are fast.
        </p>
      )}

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

      {error && (
        <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <p className="text-sm text-slate-500">
        Or{" "}
        <button
          type="button"
          onClick={onDemo}
          className="text-sky-600 underline underline-offset-2"
        >
          open the 500,000 row demo
        </button>{" "}
        — no upload, no backend.
      </p>
    </div>
  );
}
