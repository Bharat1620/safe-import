/**
 * The adapter boundary. Everything in src/sheet/ talks to the outside world
 * through these types and nothing else — no fetch, no Postgres, no app imports.
 *
 * Demo backs this with a generated in-memory array.
 * Safe Import backs it with paginated FastAPI calls against Postgres.
 * Same component, different adapter, no rewrite.
 */

export type CellValue = string

export interface Row {
  /** Absolute index in the full dataset, not the index within a loaded window. */
  index: number
  cells: Record<string, CellValue>
}

export interface ColumnDef {
  key: string
  header: string
  width: number
}

/** One cell-level change. The unit the undo stack is built from. */
export interface CellDiff {
  rowIndex: number
  columnKey: string
  before: CellValue
  after: CellValue
}

export interface CellError {
  rowIndex: number
  columnKey: string
  message: string
}

export interface SheetDataSource {
  getTotalCount(): Promise<number>
  getRows(offset: number, limit: number): Promise<Row[]>
  applyEdits(diffs: CellDiff[]): Promise<void>
  getCellErrors?(offset: number, limit: number): Promise<CellError[]>
}
