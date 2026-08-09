import type { CellDiff, Row, SheetDataSource } from "../sheet/types";
import { generateRow } from "./generateRows";

/**
 * Demo backing for SheetDataSource, replaced by an API-backed source later and
 * kept for benchmarks and tests.
 *
 * Rows are generated on demand and only edits are stored, so 500k rows costs
 * nothing until you type. Every method is artificially slow because the real
 * source hits a network — the grid must handle "this window hasn't arrived yet"
 * from day one rather than discovering it after the swap.
 */
export class InMemorySource implements SheetDataSource {
  private overrides = new Map<string, string>();
  private readonly totalCount: number;
  private readonly latencyMs: number;

  constructor(totalCount: number, latencyMs = 40) {
    this.totalCount = totalCount;
    this.latencyMs = latencyMs;
  }

  async getTotalCount(): Promise<number> {
    await this.delay();
    return this.totalCount;
  }

  async getRows(offset: number, limit: number): Promise<Row[]> {
    await this.delay();
    const end = Math.min(offset + limit, this.totalCount);
    const rows: Row[] = [];
    for (let i = offset; i < end; i++) {
      const row = generateRow(i);
      for (const key of Object.keys(row.cells)) {
        const override = this.overrides.get(`${i}:${key}`);
        if (override !== undefined) row.cells[key] = override;
      }
      rows.push(row);
    }
    return rows;
  }

  async applyEdits(diffs: CellDiff[]): Promise<void> {
    await this.delay();
    for (const d of diffs) {
      this.overrides.set(`${d.rowIndex}:${d.columnKey}`, d.after);
    }
  }

  get editCount(): number {
    return this.overrides.size;
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }
}
