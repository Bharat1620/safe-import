import { useCallback, useState } from "react";

export interface CellPosition {
  row: number;
  col: number;
}

export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** Cursor, selection anchor and edit draft. Pure coordinates — no data, no DOM. */
export function useGridCursor(rowCount: number, colCount: number) {
  const [active, setActive] = useState<CellPosition>({ row: 0, col: 0 });

  /** Where a shift-selection started. The rectangle is derived from this and
   *  `active`, never stored, so dragging in any direction needs no special case. */
  const [anchor, setAnchor] = useState<CellPosition | null>(null);

  /**
   * null = not editing. Kept outside the row data because `before` for the diff
   * is read from the row at commit time, and so Escape needs no undo.
   */
  const [draft, setDraft] = useState<string | null>(null);

  const clamp = useCallback(
    (p: CellPosition): CellPosition => ({
      row: Math.min(Math.max(p.row, 0), Math.max(rowCount - 1, 0)),
      col: Math.min(Math.max(p.col, 0), Math.max(colCount - 1, 0)),
    }),
    [rowCount, colCount]
  );

  // `extend` is the shift key; `a ?? current` keeps the anchor where the
  // selection first started so repeated shift+arrow grows one rectangle.
  const moveTo = useCallback(
    (p: CellPosition, extend = false) => {
      setDraft(null);
      setActive((current) => {
        setAnchor(extend ? (a) => a ?? current : null);
        return clamp(p);
      });
    },
    [clamp]
  );

  const moveBy = useCallback(
    (rowDelta: number, colDelta: number, extend = false) => {
      setDraft(null);
      setActive((current) => {
        setAnchor(extend ? (a) => a ?? current : null);
        return clamp({
          row: current.row + rowDelta,
          col: current.col + colDelta,
        });
      });
    },
    [clamp]
  );

  /** Enter opens with the existing value to amend; typing opens with just that
   *  character, replacing it. */
  const beginEdit = useCallback((initial: string) => setDraft(initial), []);
  const cancelEdit = useCallback(() => setDraft(null), []);

  // With no anchor this collapses to the active cell, so one path covers both.
  const selection: CellRange = {
    top: Math.min(anchor?.row ?? active.row, active.row),
    bottom: Math.max(anchor?.row ?? active.row, active.row),
    left: Math.min(anchor?.col ?? active.col, active.col),
    right: Math.max(anchor?.col ?? active.col, active.col),
  };

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
  };
}
