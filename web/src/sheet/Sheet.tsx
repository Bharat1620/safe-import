import { useCallback, useEffect, useRef, useState } from 'react'
import { GUTTER_WIDTH, OVERSCAN, ROW_HEIGHT } from './constants'
import { useGridCursor } from './useGridCursor'
import { useUndoStack } from './useUndoStack'
import { useWindowedRows } from './useWindowedRows'
import type { CellDiff, ColumnDef, SheetDataSource } from './types'

interface SheetProps {
  dataSource: SheetDataSource
  columns: ColumnDef[]
}

export function Sheet({ dataSource, columns }: SheetProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  /**
   * Row height is a constant; viewport height is not. The grid fills whatever
   * the parent gives it, so it must be measured. ResizeObserver rather than
   * window.innerHeight — "how big is this element" is a different question from
   * "how big is the browser", and the grid may sit in a panel.
   */
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The whole of virtualization, in three lines.
  const firstVisible = Math.floor(scrollTop / ROW_HEIGHT)
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT)
  const startIndex = Math.max(0, firstVisible - OVERSCAN)
  const windowSize = visibleCount + OVERSCAN * 2

  const { totalCount, getRow, applyEdits } = useWindowedRows(
    dataSource,
    startIndex,
    startIndex + windowSize,
  )

  const rowCount = totalCount ?? 0
  const endIndex = Math.min(rowCount, startIndex + windowSize)

  const cursor = useGridCursor(rowCount, columns.length)
  const undo = useUndoStack(applyEdits)

  const valueAt = useCallback(
    (row: number, col: number) => getRow(row)?.cells[columns[col].key] ?? '',
    [getRow, columns],
  )

  /**
   * Keyboard movement can land outside the rendered window. The cursor is
   * coordinates, not a DOM element, so there is nothing to call scrollIntoView
   * on — the scroll position is computed from the row index instead.
   */
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const top = cursor.active.row * ROW_HEIGHT
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
      el.scrollTop = top + ROW_HEIGHT - el.clientHeight
    }
  }, [cursor.active.row])

  useEffect(() => {
    if (cursor.isEditing) inputRef.current?.focus()
  }, [cursor.isEditing])

  const commitEdit = useCallback(async () => {
    if (cursor.draft === null) return
    const { row, col } = cursor.active
    const before = valueAt(row, col)
    const after = cursor.draft
    cursor.cancelEdit()
    // Retyping the same value produces no diff, so no pointless undo step.
    if (before === after) return
    await undo.push([
      { rowIndex: row, columnKey: columns[col].key, before, after },
    ])
  }, [cursor, valueAt, columns, undo])

  /** Every cell in the current selection, as one command. */
  const diffsForSelection = useCallback(
    (next: (before: string) => string): CellDiff[] => {
      const { top, bottom, left, right } = cursor.selection
      const diffs: CellDiff[] = []
      for (let row = top; row <= bottom; row++) {
        for (let col = left; col <= right; col++) {
          const before = valueAt(row, col)
          const after = next(before)
          if (before !== after) {
            diffs.push({
              rowIndex: row,
              columnKey: columns[col].key,
              before,
              after,
            })
          }
        }
      }
      return diffs
    },
    [cursor.selection, valueAt, columns],
  )

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey

    if (cursor.isEditing) {
      if (e.key === 'Enter') {
        e.preventDefault()
        await commitEdit()
        cursor.moveBy(1, 0)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        await commitEdit()
        cursor.moveBy(0, e.shiftKey ? -1 : 1)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cursor.cancelEdit()
      }
      return
    }

    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      await (e.shiftKey ? undo.redo() : undo.undo())
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        return cursor.moveBy(1, 0, e.shiftKey)
      case 'ArrowUp':
        e.preventDefault()
        return cursor.moveBy(-1, 0, e.shiftKey)
      case 'ArrowRight':
        e.preventDefault()
        return cursor.moveBy(0, 1, e.shiftKey)
      case 'ArrowLeft':
        e.preventDefault()
        return cursor.moveBy(0, -1, e.shiftKey)
      case 'Tab':
        e.preventDefault()
        return cursor.moveBy(0, e.shiftKey ? -1 : 1)
      case 'PageDown':
        e.preventDefault()
        return cursor.moveBy(visibleCount, 0, e.shiftKey)
      case 'PageUp':
        e.preventDefault()
        return cursor.moveBy(-visibleCount, 0, e.shiftKey)
      case 'Home':
        e.preventDefault()
        return cursor.moveTo(
          { row: mod ? 0 : cursor.active.row, col: 0 },
          e.shiftKey,
        )
      case 'End':
        e.preventDefault()
        return cursor.moveTo(
          {
            row: mod ? rowCount - 1 : cursor.active.row,
            col: columns.length - 1,
          },
          e.shiftKey,
        )
      case 'Enter':
      case 'F2':
        e.preventDefault()
        return cursor.beginEdit(valueAt(cursor.active.row, cursor.active.col))
      case 'Delete':
      case 'Backspace':
        e.preventDefault()
        return undo.push(diffsForSelection(() => ''))
    }

    // A printable character starts an edit and replaces the value, as in any
    // spreadsheet. Enter/F2 above open with the existing value instead.
    if (!mod && e.key.length === 1) {
      e.preventDefault()
      cursor.beginEdit(e.key)
    }
  }

  /** Copy the selection as TSV — the format spreadsheets exchange. */
  const handleCopy = (e: React.ClipboardEvent) => {
    if (cursor.isEditing) return
    e.preventDefault()
    const { top, bottom, left, right } = cursor.selection
    const lines: string[] = []
    for (let row = top; row <= bottom; row++) {
      const cells: string[] = []
      for (let col = left; col <= right; col++) cells.push(valueAt(row, col))
      lines.push(cells.join('\t'))
    }
    e.clipboardData.setData('text/plain', lines.join('\n'))
  }

  /**
   * Paste writes a rectangle starting at the active cell, clipped to the grid.
   * However many cells it touches, it is ONE undo entry.
   */
  const handlePaste = (e: React.ClipboardEvent) => {
    if (cursor.isEditing) return
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (!text) return

    const grid = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
    const { row: baseRow, col: baseCol } = cursor.active
    const diffs: CellDiff[] = []

    grid.forEach((line, rowOffset) => {
      line.split('\t').forEach((value, colOffset) => {
        const row = baseRow + rowOffset
        const col = baseCol + colOffset
        if (row >= rowCount || col >= columns.length) return
        const before = valueAt(row, col)
        if (before !== value) {
          diffs.push({
            rowIndex: row,
            columnKey: columns[col].key,
            before,
            after: value,
          })
        }
      })
    })

    void undo.push(diffs)
  }

  const indices: number[] = []
  for (let i = startIndex; i < endIndex; i++) indices.push(i)

  const totalWidth =
    GUTTER_WIDTH + columns.reduce((sum, column) => sum + column.width, 0)

  const { top, bottom, left, right } = cursor.selection
  const selectedCount = (bottom - top + 1) * (right - left + 1)

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
          A spacer, and nothing else. One empty div as tall as every row combined
          gives the browser a correct scrollbar without any row existing.

          Ceiling worth knowing: browsers cap element height around 17M px
          (Firefox) to 33M px (Chrome). At 26px rows that is ~650k rows before
          the scroll container itself breaks — which is why the demo caps at 500k.
        */}
        <div style={{ height: rowCount * ROW_HEIGHT, width: totalWidth }} />

        {/*
          The rendered rows are absolutely positioned and shifted down by
          startIndex * ROW_HEIGHT, so these ~40 rows sit exactly where rows
          startIndex..endIndex would sit if all 500k existed.
        */}
        <div
          className="absolute top-0 left-0"
          style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}
        >
          {indices.map((index) => (
            <div
              key={index}
              role="row"
              // Absolute index, not the position within the rendered window,
              // or assistive tech reads every row as "row 1 of 40".
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
                const row = getRow(index)
                const isActive =
                  cursor.active.row === index && cursor.active.col === col
                const inSelection =
                  index >= top && index <= bottom && col >= left && col <= right

                return (
                  <div
                    key={column.key}
                    role="gridcell"
                    aria-colindex={col + 1}
                    aria-selected={inSelection}
                    // Shift+click extends from the existing cursor position.
                    onMouseDown={(e) =>
                      cursor.moveTo({ row: index, col }, e.shiftKey)
                    }
                    onDoubleClick={() => cursor.beginEdit(valueAt(index, col))}
                    className={[
                      'shrink-0 overflow-hidden border-r border-slate-100 px-2 leading-[25px] whitespace-nowrap',
                      isActive
                        ? 'outline-2 -outline-offset-2 outline-sky-500'
                        : inSelection
                          ? 'bg-sky-50'
                          : '',
                    ].join(' ')}
                    style={{ width: column.width }}
                  >
                    {isActive && cursor.isEditing ? (
                      <input
                        ref={inputRef}
                        value={cursor.draft ?? ''}
                        onChange={(e) => cursor.setDraft(e.target.value)}
                        onBlur={() => void commitEdit()}
                        className="w-full bg-white leading-[25px] outline-none"
                      />
                    ) : row ? (
                      row.cells[column.key]
                    ) : (
                      // A placeholder, not a blank gap. A grey bar at the right
                      // height reads as "loading"; empty space reads as broken.
                      <span className="my-[7px] block h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 gap-4 border-t border-slate-200 bg-slate-50 px-2 py-1 text-slate-500 tabular-nums">
        <span>
          {totalCount === null
            ? 'loading…'
            : `${rowCount.toLocaleString()} rows · rendering ${indices.length}`}
        </span>
        <span>
          cell {cursor.active.row + 1},{cursor.active.col + 1}
          {cursor.hasRange && ` · ${selectedCount} selected`}
        </span>
        <span>undo depth {undo.depth}</span>
      </div>
    </div>
  )
}
