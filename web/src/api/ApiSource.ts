import type { CellDiff, Row, SheetDataSource } from "../sheet/types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

// The only thing that changes when the grid moves off demo data. Same three
// methods, backed by Postgres instead of a generated array.
export class ApiSource implements SheetDataSource {
  private readonly importId: number;
  private readonly errorsOnly: boolean;

  /**
   * Filtered rows are not contiguous, so the grid's index is a position within
   * the filtered set rather than a row in the file. Edits have to be translated
   * back before they reach the API, or they would write to the wrong rows.
   */
  private rowNumbers = new Map<number, number>();

  constructor(importId: number, errorsOnly = false) {
    this.importId = importId;
    this.errorsOnly = errorsOnly;
  }

  private query(extra = "") {
    return `${BASE}/imports/${this.importId}${extra}${
      this.errorsOnly ? (extra.includes("?") ? "&" : "?") + "errors_only=true" : ""
    }`;
  }

  async getTotalCount(): Promise<number> {
    const r = await fetch(this.query("/rows/count"));
    if (!r.ok) throw new Error("Could not read the row count");
    const { count } = (await r.json()) as { count: number };
    return count;
  }

  async getRows(offset: number, limit: number): Promise<Row[]> {
    const r = await fetch(this.query(`/rows?offset=${offset}&limit=${limit}`));
    if (!r.ok) throw new Error("Could not read rows");
    const { rows } = (await r.json()) as {
      rows: (Row & { row_number?: number })[];
    };
    return rows.map(({ row_number, ...row }) => {
      if (row_number !== undefined) {
        this.rowNumbers.set(row.index, row_number);
      }
      return { ...row, rowNumber: row_number };
    });
  }

  async applyEdits(diffs: CellDiff[]): Promise<void> {
    const translated = diffs.map((d) => ({
      ...d,
      rowIndex: (this.rowNumbers.get(d.rowIndex) ?? d.rowIndex + 1) - 1,
    }));

    const r = await fetch(`${BASE}/imports/${this.importId}/rows`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diffs: translated }),
    });
    if (!r.ok) throw new Error("Could not save changes");
  }
}
