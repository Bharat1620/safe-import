export type CellValue = string

export interface Row {
  /** Absolute index in the full dataset, not the position within a window. */
  index: number
  cells: Record<string, CellValue>
  /** Field-level validation errors, keyed by column. */
  errors?: Record<string, string> | null
  /** Position in the source data, shown in the gutter. Differs from `index`
   *  when the source is filtered. */
  rowNumber?: number
}

export interface ColumnDef {
  key: string
  header: string
  width: number
}

/** One cell change. The unit the undo stack is built from. */
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

/**
 * The adapter boundary. Nothing in src/sheet/ reaches outside these methods, so
 * the same grid runs against an in-memory array or a paginated API unchanged.
 */
export interface SheetDataSource {
  getTotalCount(): Promise<number>
  getRows(offset: number, limit: number): Promise<Row[]>
  applyEdits(diffs: CellDiff[]): Promise<void>
  getCellErrors?(offset: number, limit: number): Promise<CellError[]>
}
