import { useCallback, useEffect, useRef, useState } from "react";
import { GUTTER_WIDTH, OVERSCAN, ROW_HEIGHT } from "./constants";
import { useGridCursor } from "./useGridCursor";
import { useUndoStack } from "./useUndoStack";
import { useWindowedRows } from "./useWindowedRows";
import type { CellDiff, ColumnDef, SheetDataSource } from "./types";

interface SheetProps {
  dataSource: SheetDataSource;
  columns: ColumnDef[];
}

export function Sheet({ dataSource, columns }: SheetProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // Row height is a constant but viewport height is not, so it has to be
  // measured. ResizeObserver rather than window.innerHeight: the grid is not
  // the window, and it should stay correct inside a panel.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const firstVisible = Math.floor(scrollTop / ROW_HEIGHT);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT);
  const startIndex = Math.max(0, firstVisible - OVERSCAN);
  const windowSize = visibleCount + OVERSCAN * 2;

  const { totalCount, getRow, applyEdits } = useWindowedRows(
    dataSource,
    startIndex,
    startIndex + windowSize
  );

  const rowCount = totalCount ?? 0;
  const endIndex = Math.min(rowCount, startIndex + windowSize);

  const cursor = useGridCursor(rowCount, columns.length);
  const undo = useUndoStack(applyEdits);

  const valueAt = useCallback(
    (row: number, col: number) => getRow(row)?.cells[columns[col].key] ?? "",
    [getRow, columns]
  );

  // Arrow keys have their native scrolling prevented, so the grid owns
  // scrolling for them. The target row may not be rendered, so there is no
  // element to scrollIntoView — the position is computed from the index.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const top = cursor.active.row * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
    }
  }, [cursor.active.row]);

  useEffect(() => {
    if (cursor.isEditing) inputRef.current?.focus();
  }, [cursor.isEditing]);

  const commitEdit = useCallback(async () => {
    if (cursor.draft === null) return;
    const { row, col } = cursor.active;
    const before = valueAt(row, col);
    const after = cursor.draft;
    cursor.cancelEdit();
    if (before === after) return;
    await undo.push([
      { rowIndex: row, columnKey: columns[col].key, before, after },
    ]);
  }, [cursor, valueAt, columns, undo]);

  /** Every cell in the selection, as one command. */
  const diffsForSelection = useCallback(
    (next: (before: string) => string): CellDiff[] => {
      const { top, bottom, left, right } = cursor.selection;
      const diffs: CellDiff[] = [];
      for (let row = top; row <= bottom; row++) {
        for (let col = left; col <= right; col++) {
          const before = valueAt(row, col);
          const after = next(before);
          if (before !== after) {
            diffs.push({
              rowIndex: row,
              columnKey: columns[col].key,
              before,
              after,
            });
          }
        }
      }
      return diffs;
    },
    [cursor.selection, valueAt, columns]
  );

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;

    if (cursor.isEditing) {
      if (e.key === "Enter") {
        e.preventDefault();
        await commitEdit();
        cursor.moveBy(1, 0);
      } else if (e.key === "Tab") {
        e.preventDefault();
        await commitEdit();
        cursor.moveBy(0, e.shiftKey ? -1 : 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cursor.cancelEdit();
      }
      return;
    }

    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      await (e.shiftKey ? undo.redo() : undo.undo());
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        return cursor.moveBy(1, 0, e.shiftKey);
      case "ArrowUp":
        e.preventDefault();
        return cursor.moveBy(-1, 0, e.shiftKey);
      case "ArrowRight":
        e.preventDefault();
        return cursor.moveBy(0, 1, e.shiftKey);
      case "ArrowLeft":
        e.preventDefault();
        return cursor.moveBy(0, -1, e.shiftKey);
      case "Tab":
        e.preventDefault();
        return cursor.moveBy(0, e.shiftKey ? -1 : 1);
      case "PageDown":
        e.preventDefault();
        return cursor.moveBy(visibleCount, 0, e.shiftKey);
      case "PageUp":
        e.preventDefault();
        return cursor.moveBy(-visibleCount, 0, e.shiftKey);
      case "Home":
        e.preventDefault();
        return cursor.moveTo(
          { row: mod ? 0 : cursor.active.row, col: 0 },
          e.shiftKey
        );
      case "End":
        e.preventDefault();
        return cursor.moveTo(
          {
            row: mod ? rowCount - 1 : cursor.active.row,
            col: columns.length - 1,
          },
          e.shiftKey
        );
      case "Enter":
      case "F2":
        e.preventDefault();
        return cursor.beginEdit(valueAt(cursor.active.row, cursor.active.col));
      case "Delete":
      case "Backspace":
        e.preventDefault();
        return undo.push(diffsForSelection(() => ""));
    }

    // Printable characters start an edit and replace the value, as in any
    // spreadsheet. length === 1 excludes "ArrowDown", "Shift" and friends.
    if (!mod && e.key.length === 1) {
      e.preventDefault();
      cursor.beginEdit(e.key);
    }
  };

  const handleCopy = (e: React.ClipboardEvent) => {
    if (cursor.isEditing) return;
    e.preventDefault();
    const { top, bottom, left, right } = cursor.selection;
    const lines: string[] = [];
    for (let row = top; row <= bottom; row++) {
      const cells: string[] = [];
      for (let col = left; col <= right; col++) cells.push(valueAt(row, col));
      lines.push(cells.join("\t"));
    }
    e.clipboardData.setData("text/plain", lines.join("\n"));
  };

  /** Writes a rectangle from the active cell. However many cells, one undo entry. */
  const handlePaste = (e: React.ClipboardEvent) => {
    if (cursor.isEditing) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    const grid = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
    const { row: baseRow, col: baseCol } = cursor.active;
    const diffs: CellDiff[] = [];

    grid.forEach((line, rowOffset) => {
      line.split("\t").forEach((value, colOffset) => {
        const row = baseRow + rowOffset;
        const col = baseCol + colOffset;
        if (row >= rowCount || col >= columns.length) return;
        const before = valueAt(row, col);
        if (before !== value) {
          diffs.push({
            rowIndex: row,
            columnKey: columns[col].key,
            before,
            after: value,
          });
        }
      });
    });

    void undo.push(diffs);
  };

  const indices: number[] = [];
  for (let i = startIndex; i < endIndex; i++) indices.push(i);

  const totalWidth =
    GUTTER_WIDTH + columns.reduce((sum, column) => sum + column.width, 0);

  const { top, bottom, left, right } = cursor.selection;
  const selectedCount = (bottom - top + 1) * (right - left + 1);

  return (
    <div className="flex h-full flex-col border border-slate-200 text-[13px]">
      <div className="flex shrink-0 border-b border-slate-200 bg-slate-50 font-medium">
        <div
          className="shrink-0 border-r border-slate-200 px-2 py-1 text-right text-slate-400"
          style={{ width: GUTTER_WIDTH }}
        >
          #
        </div>
        {columns.map((column) => (
          <div
            key={column.key}
            className="shrink-0 border-r border-slate-200 px-2 py-1"
            style={{ width: column.width }}
          >
            {column.header}
          </div>
        ))}
      </div>

      <div
        ref={viewportRef}
        tabIndex={0}
        role="grid"
        aria-rowcount={rowCount}
        aria-colcount={columns.length}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={handleKeyDown}
        onCopy={handleCopy}
        onPaste={handlePaste}
        className="relative flex-1 overflow-auto outline-none"
      >
        {/*
          Empty spacer, as tall as every row combined. Absolutely positioned rows
          contribute no height, so without this there is nothing to scroll.
          Browsers cap element height at ~17M px (Firefox) to ~33M (Chrome),
          which at 26px rows is ~650k rows — hence the 500k demo cap.
        */}
        <div style={{ height: rowCount * ROW_HEIGHT, width: totalWidth }} />

        {/*
          Shifted so the ~40 rendered rows sit exactly where rows
          startIndex..endIndex would be if all of them existed. transform rather
          than top: it composites without a layout pass on every scroll frame.
        */}
        <div
          className="absolute top-0 left-0"
          style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}
        >
          {indices.map((index) => {
            const row = getRow(index);

            return (
              <div
                key={index}
                role="row"
                // Absolute, or assistive tech reads every row as "1 of 40".
                aria-rowindex={index + 1}
                className="flex border-b border-slate-100"
                style={{ height: ROW_HEIGHT }}
              >
                <div
                  className="shrink-0 border-r border-slate-100 px-2 text-right leading-[25px] text-slate-400 tabular-nums"
                  style={{ width: GUTTER_WIDTH }}
                >
                  {index + 1}
                </div>
                {columns.map((column, col) => {
                  const isActive =
                    cursor.active.row === index && cursor.active.col === col;
                  const inSelection =
                    index >= top &&
                    index <= bottom &&
                    col >= left &&
                    col <= right;

                  return (
                    <div
                      key={column.key}
                      role="gridcell"
                      aria-colindex={col + 1}
                      aria-selected={inSelection}
                      onMouseDown={(e) =>
                        cursor.moveTo({ row: index, col }, e.shiftKey)
                      }
                      onDoubleClick={() =>
                        cursor.beginEdit(valueAt(index, col))
                      }
                      className={[
                        "shrink-0 overflow-hidden border-r border-slate-100 px-2 leading-[25px] whitespace-nowrap",
                        isActive
                          ? "outline-2 -outline-offset-2 outline-sky-500"
                          : inSelection
                            ? "bg-sky-50"
                            : "",
                      ].join(" ")}
                      style={{ width: column.width }}
                    >
                      {isActive && cursor.isEditing ? (
                        <input
                          ref={inputRef}
                          value={cursor.draft ?? ""}
                          onChange={(e) => cursor.setDraft(e.target.value)}
                          onBlur={() => void commitEdit()}
                          className="w-full bg-white leading-[25px] outline-none"
                        />
                      ) : row ? (
                        row.cells[column.key]
                      ) : (
                        <span className="my-[7px] block h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 gap-4 border-t border-slate-200 bg-slate-50 px-2 py-1 text-slate-500 tabular-nums">
        <span>
          {totalCount === null
            ? "loading…"
            : `${rowCount.toLocaleString()} rows · rendering ${indices.length}`}
        </span>
        <span>
          cell {cursor.active.row + 1},{cursor.active.col + 1}
          {cursor.hasRange && ` · ${selectedCount} selected`}
        </span>
        <span>undo depth {undo.depth}</span>
      </div>
    </div>
  );
}
