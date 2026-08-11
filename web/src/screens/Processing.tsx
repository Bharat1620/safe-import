import { useEffect, useState } from "react";
import { getJob, processImport } from "../api/client";

interface ProcessingProps {
  importId: number;
  jobId: number;
  onDone: () => void;
}

export function Processing({ importId, jobId, onDone }: ProcessingProps) {
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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3 py-24">
      <h2 className="font-medium text-slate-800">Processing your file</h2>

      <div className="h-2 overflow-hidden rounded bg-slate-100">
        <div
          className="h-2 rounded bg-sky-500 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      {job?.status === "failed" ? (
        <p className="text-sm text-rose-700">{job.error ?? "Processing failed"}</p>
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
