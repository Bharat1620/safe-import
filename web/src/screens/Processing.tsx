import { useEffect, useState } from "react";
import { getJob, processImport } from "../api/client";

interface ProcessingProps {
  importId: number;
  jobId: number;
  onDone: () => void;
  onCancel: () => void;
}

export function Processing({
  importId,
  jobId,
  onDone,
  onCancel,
}: ProcessingProps) {
  const [job, setJob] = useState<{
    status: string;
    processed_rows: number;
    total_rows: number;
    error: string | null;
  } | null>(null);

  // Locally this stands in for the worker loop; deployed, a task queue calls
  // the same endpoint. Safe to call more than once — it resumes.
  useEffect(() => {
    void processImport(importId).catch(() => {});
  }, [importId]);

  useEffect(() => {
    let stop = false;

    async function poll() {
      while (!stop) {
        try {
          const next = await getJob(jobId);
          if (stop) return;
          setJob(next);
          if (next.status === "done") return onDone();
          if (next.status === "failed") return;
        } catch {
          // Keep polling; a dropped request should not end the progress view.
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    void poll();
    return () => {
      stop = true;
    };
  }, [jobId, onDone]);

  const pct =
    job && job.total_rows > 0
      ? Math.round((job.processed_rows / job.total_rows) * 100)
      : 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-24">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Processing your file
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto text-sm text-sky-600 underline underline-offset-2"
        >
          Cancel
        </button>
      </div>

      <p className="text-slate-600">
        This runs in the background, so closing the tab will not stop it.
      </p>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-sky-500 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      {job?.status === "failed" ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {job.error ?? "Processing failed"}
        </p>
      ) : (
        <p className="text-sm text-slate-500 tabular-nums">
          {job === null || job.status === "pending"
            ? "Queued…"
            : `${job.processed_rows.toLocaleString()} of ${job.total_rows.toLocaleString()} rows`}
        </p>
      )}
    </div>
  );
}
