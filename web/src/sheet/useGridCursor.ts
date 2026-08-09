import { useCallback, useState } from 'react'

export interface CellPosition {
  row: number
  col: number
}

export interface CellRange {
  top: number
  left: number
  bottom: number
  right: number
}

/**
 * Cursor, selection anchor, and edit draft. Pure coordinates — no data, no DOM.
 * The cursor can sit on row 400,000 whether or not that row is rendered.
 */
export function useGridCursor(rowCount: number, colCount: number) {
  const [active, setActive] = useState<CellPosition>({ row: 0, col: 0 })

  /**
   * A range is two points: the anchor (where selection started) and the active
   * cell (where it is now). The rectangle is derived below, never stored, so it
   * cannot drift out of sync with the cursor — and dragging upward or leftward
   * needs no special case, since min/max sorts the corners.
   */
  const [anchor, setAnchor] = useState<CellPosition | null>(null)

  /**
   * null = not editing. A string = editing, holding in-progress text.
   *
   * The draft must live outside the row data: `before` for the diff is read
   * from the row at commit time, so overwriting the cell as you type would
   * destroy the value undo needs. It also means Escape is free — nothing was
   * written, so nothing has to be reverted.
   */
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = useCallback(
    (p: CellPosition): CellPosition => ({
      row: Math.min(Math.max(p.row, 0), Math.max(rowCount - 1, 0)),
      col: Math.min(Math.max(p.col, 0), Math.max(colCount - 1, 0)),
    }),
    [rowCount, colCount],
  )

  // `extend` is the shift key. `a ?? current` keeps the anchor where selection
  // first started, so repeated shift+arrow grows one rectangle.
  const moveTo = useCallback(
    (p: CellPosition, extend = false) => {
      setDraft(null)
      setActive((current) => {
        setAnchor(extend ? (a) => a ?? current : null)
        return clamp(p)
      })
    },
    [clamp],
  )

  const moveBy = useCallback(
    (rowDelta: number, colDelta: number, extend = false) => {
      setDraft(null)
      setActive((current) => {
        setAnchor(extend ? (a) => a ?? current : null)
        return clamp({ row: current.row + rowDelta, col: current.col + colDelta })
      })
    },
    [clamp],
  )

  /**
   * `initial` is how the two entry points differ: Enter/double-click opens with
   * the existing value to amend; typing a character opens with just that
   * character, replacing it — what every spreadsheet does.
   */
  const beginEdit = useCallback((initial: string) => setDraft(initial), [])
  const cancelEdit = useCallback(() => setDraft(null), [])

  // With no anchor, `?? active` collapses the rectangle to the single active
  // cell — so one code path covers both a cursor and a range.
  const selection: CellRange = {
    top: Math.min(anchor?.row ?? active.row, active.row),
    bottom: Math.max(anchor?.row ?? active.row, active.row),
    left: Math.min(anchor?.col ?? active.col, active.col),
    right: Math.max(anchor?.col ?? active.col, active.col),
  }

  return {
    active,
    selection,
    hasRange: anchor !== null,
    draft,
    isEditing: draft !== null,
    setDraft,
    moveTo,
    moveBy,
    beginEdit,
    cancelEdit,
  }
}
