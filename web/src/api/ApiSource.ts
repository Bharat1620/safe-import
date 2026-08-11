import type { CellDiff, Row, SheetDataSource } from "../sheet/types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

// The only thing that changes when the grid moves off demo data. Same three
// methods, backed by Postgres instead of a generated array.
export class ApiSource implements SheetDataSource {
  private readonly importId: number;

  constructor(importId: number) {
    this.importId = importId;
  }

  async getTotalCount(): Promise<number> {
    const r = await fetch(`${BASE}/imports/${this.importId}/rows/count`);
    if (!r.ok) throw new Error("Could not read the row count");
    const { count } = (await r.json()) as { count: number };
    return count;
  }

  async getRows(offset: number, limit: number): Promise<Row[]> {
    const r = await fetch(
      `${BASE}/imports/${this.importId}/rows?offset=${offset}&limit=${limit}`,
    );
    if (!r.ok) throw new Error("Could not read rows");
    const { rows } = (await r.json()) as { rows: Row[] };
    return rows;
  }

  async applyEdits(diffs: CellDiff[]): Promise<void> {
    const r = await fetch(`${BASE}/imports/${this.importId}/rows`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diffs }),
    });
    if (!r.ok) throw new Error("Could not save changes");
  }
}
