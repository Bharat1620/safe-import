import type { CellDiff, Row, SheetDataSource } from '../sheet/types'
import { generateRow } from './generateRows'

/**
 * Demo backing for SheetDataSource. Replaced by an API-backed source on Aug 9;
 * kept afterwards for benchmarks and unit tests, which must not need a database.
 *
 * Two deliberate choices:
 *
 * 1. Rows are generated on demand and only *edits* are stored, keyed by
 *    `${rowIndex}:${columnKey}`. Memory grows with edits made, not with dataset
 *    size — 500k rows costs nothing until you type.
 *
 * 2. Every method is async and artificially slow. The real source will hit a
 *    network, so the grid must already handle "this window has not arrived yet"
 *    and render placeholders. An instant demo would hide that, and the bug
 *    would surface only after the Postgres swap.
 */
export class InMemorySource implements SheetDataSource {
  private overrides = new Map<string, string>()
  private readonly totalCount: number
  private readonly latencyMs: number

  constructor(totalCount: number, latencyMs = 40) {
    this.totalCount = totalCount
    this.latencyMs = latencyMs
  }

  async getTotalCount(): Promise<number> {
    await this.delay()
    return this.totalCount
  }

  async getRows(offset: number, limit: number): Promise<Row[]> {
    await this.delay()
    const end = Math.min(offset + limit, this.totalCount)
    const rows: Row[] = []
    for (let i = offset; i < end; i++) {
      const row = generateRow(i)
      for (const key of Object.keys(row.cells)) {
        const override = this.overrides.get(`${i}:${key}`)
        if (override !== undefined) row.cells[key] = override
      }
      rows.push(row)
    }
    return rows
  }

  async applyEdits(diffs: CellDiff[]): Promise<void> {
    await this.delay()
    for (const d of diffs) {
      this.overrides.set(`${d.rowIndex}:${d.columnKey}`, d.after)
    }
  }

  /** For the benchmark panel — "edits held" is a real number worth showing. */
  get editCount(): number {
    return this.overrides.size
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.latencyMs))
  }
}
