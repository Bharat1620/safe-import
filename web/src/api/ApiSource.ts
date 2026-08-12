import type { CellDiff, Row, SheetDataSource } from "../sheet/types";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

interface ApiSourceOptions {
  errorsOnly?: boolean;
  onErrorCount?: (n: number) => void;
  onSaved?: () => void;
  onSaveError?: (message: string) => void;
}

// The only thing that changes when the grid moves off demo data. Same three
// methods, backed by Postgres instead of a generated array.
export class ApiSource implements SheetDataSource {
  private readonly importId: number;
  private readonly options: ApiSourceOptions;

  /**
   * Filtered rows are not contiguous, so the grid's index is a position within
   * the filtered set rather than a row in the file. Edits have to be translated
   * back before they reach the API, or they would write to the wrong rows.
   */
  private rowNumbers = new Map<number, number>();

  /**
   * Resolved by the first getRows response, which carries the total. Asking for
   * the count separately would be a second round trip before a row appears.
   */
  private total?: Promise<number>;
  private resolveTotal!: (n: number) => void;

  constructor(importId: number, options: ApiSourceOptions = {}) {
    this.importId = importId;
    this.options = options;
  }

  private query(extra = "") {
    return `${BASE}/imports/${this.importId}${extra}${
      this.options.errorsOnly
        ? (extra.includes("?") ? "&" : "?") + "errors_only=true"
        : ""
    }`;
  }

  async getTotalCount(): Promise<number> {
    this.total ??= new Promise<number>((resolve) => {
      this.resolveTotal = resolve;
    });
    return this.total;
  }

  async getRows(offset: number, limit: number): Promise<Row[]> {
    const r = await fetch(this.query(`/rows?offset=${offset}&limit=${limit}`));
    if (!r.ok) throw new Error("Could not read rows");
    const { rows, total, error_count } = (await r.json()) as {
      rows: (Row & { row_number?: number })[];
      total: number;
      error_count: number;
    };

    void this.getTotalCount();
    this.resolveTotal?.(total);
    this.options.onErrorCount?.(error_count);

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

    try {
      const r = await fetch(`${BASE}/imports/${this.importId}/rows`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diffs: translated }),
      });
      if (!r.ok) throw new Error(await r.text());
      this.options.onSaved?.();
    } catch (e) {
      // The grid has already applied the change locally, so a silent failure
      // would leave the screen disagreeing with the database.
      this.options.onSaveError?.(
        e instanceof Error ? e.message : "Could not save that change",
      );
      throw e;
    }
  }
}
