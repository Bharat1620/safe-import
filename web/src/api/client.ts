// Relative in dev so requests go through Vite's proxy; set to the Cloud Run URL
// in production.
const BASE = import.meta.env.VITE_API_URL ?? "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// Free hosting stops the container when idle, so the first request after a
// quiet spell waits for it to boot. Firing this on page load moves that wait
// into the time someone spends reading the page.
export function warmUp(): void {
  void fetch(`${BASE}/health`).catch(() => {});
}

export interface ImportInfo {
  id: number;
  filename: string;
  status: string;
  total_rows: number;
  created_at: string;
  headers: string[] | null;
  mapping: Record<string, string> | null;
  mapping_confidence: Record<string, number> | null;
}

export interface UploadResult {
  import_id: number;
  total_rows: number;
  job_id: number | null;
}

export interface JobInfo {
  id: number;
  status: string;
  processed_rows: number;
  total_rows: number;
  error: string | null;
}

export interface CommitResult {
  committed: number;
  rejected: number;
  rejects: Record<string, string | number>[];
}

export function uploadCsv(file: File): Promise<UploadResult> {
  const body = new FormData();
  body.append("file", file);
  // A retried upload returns the original import instead of creating a second.
  body.append("idempotency_key", crypto.randomUUID());
  return request<UploadResult>("/imports", { method: "POST", body });
}

export const uploadSample = () =>
  request<UploadResult>("/imports/sample", { method: "POST" });

export const getImport = (id: number) => request<ImportInfo>(`/imports/${id}`);

export const listImports = () => request<ImportInfo[]>("/imports");

export const getJob = (id: number) => request<JobInfo>(`/jobs/${id}`);

export const processImport = (id: number) =>
  request<{ status: string }>(`/imports/${id}/process`, { method: "POST" });

export const setMapping = (id: number, mapping: Record<string, string>) =>
  request<ImportInfo>(`/imports/${id}/mapping`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mapping }),
  });

export const commitImport = (id: number, partial: boolean) =>
  request<CommitResult>(`/imports/${id}/commit?partial=${partial}`, {
    method: "POST",
  });
