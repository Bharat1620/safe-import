import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listImports, type ImportInfo } from "../api/client";

const STATUS_STYLES: Record<string, string> = {
  committed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  review: "bg-amber-50 text-amber-700 border-amber-200",
  mapping: "bg-slate-100 text-slate-600 border-slate-200",
};

export function Imports({ onOpen }: { onOpen: (importId: number) => void }) {
  const [imports, setImports] = useState<ImportInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listImports()
      .then(setImports)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not load imports"),
      );
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-8">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold text-slate-800">Imports</h1>
        <Link
          to="/"
          className="ml-auto text-sm text-sky-600 underline underline-offset-2"
        >
          New import
        </Link>
      </div>

      {error && (
        <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {imports === null && !error && (
        <div className="flex flex-col gap-px">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      )}

      {imports?.length === 0 && (
        <p className="rounded border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
          Nothing imported yet.
        </p>
      )}

      {imports && imports.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded border border-slate-200">
          {imports.map((imp) => (
            <li key={imp.id}>
              <button
                type="button"
                onClick={() => onOpen(imp.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                  {imp.filename}
                </span>
                <span
                  className={[
                    "shrink-0 rounded border px-1.5 py-0.5 text-xs",
                    STATUS_STYLES[imp.status] ?? STATUS_STYLES.mapping,
                  ].join(" ")}
                >
                  {imp.status}
                </span>
                <span className="w-24 shrink-0 text-right text-slate-500 tabular-nums">
                  {imp.total_rows.toLocaleString()} rows
                </span>
                <span className="w-32 shrink-0 text-right text-slate-400">
                  {new Date(imp.created_at).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
