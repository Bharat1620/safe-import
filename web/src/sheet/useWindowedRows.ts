import { useCallback, useEffect, useRef, useState } from 'react'
import { CHUNK_SIZE, KEEP_CHUNKS } from './constants'
import type { CellDiff, Row, SheetDataSource } from './types'

/**
 * Owns "which rows exist, and have they arrived yet".
 * Knows nothing about scrolling or rendering — it is handed a row range and
 * fetches whatever fixed-size chunks that range touches.
 */
export function useWindowedRows(
  dataSource: SheetDataSource,
  startIndex: number,
  endIndex: number,
) {
  const [totalCount, setTotalCount] = useState<number | null>(null)

  /**
   * Rows live in a ref, not state. Putting them in state would mean rebuilding
   * the Map on every arriving chunk just to get a new object identity. Instead
   * the Map is mutated in place and `version` is bumped to request one render.
   */
  const rows = useRef(new Map<number, Row>())

  /**
   * Chunk indices already *asked for* — not "arrived". Recorded before the
   * request resolves, because a fetch takes ~40ms and you will scroll several
   * times during it; marking on completion would fire duplicate requests.
   */
  const requested = useRef(new Set<number>())

  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    dataSource.getTotalCount().then((count) => {
      if (!cancelled) setTotalCount(count)
    })
    // A new dataSource is a different dataset — drop everything cached.
    return () => {
      cancelled = true
      rows.current.clear()
      requested.current.clear()
    }
  }, [dataSource])

  useEffect(() => {
    if (totalCount === null) return

    // Row index -> chunk index. Chunk 2 holds rows 400-599.
    const firstChunk = Math.floor(startIndex / CHUNK_SIZE)
    // endIndex is exclusive, so the last real row is endIndex - 1. The max()
    // guards endIndex === 0, which would otherwise ask for a negative offset.
    const lastChunk = Math.floor(Math.max(startIndex, endIndex - 1) / CHUNK_SIZE)

    // Usually one iteration; two when the window straddles a chunk boundary.
    for (let chunk = firstChunk; chunk <= lastChunk; chunk++) {
      if (requested.current.has(chunk)) continue
      requested.current.add(chunk)

      dataSource.getRows(chunk * CHUNK_SIZE, CHUNK_SIZE).then((fetched) => {
        // Keyed by absolute index, so row 450 is always at key 450.
        for (const row of fetched) rows.current.set(row.index, row)
        setVersion((v) => v + 1)
      })
    }

    // Evict distant chunks. Both structures must be cleared together: dropping
    // rows while leaving the chunk in `requested` would show permanent
    // placeholders after scrolling back, since nothing would re-fetch them.
    for (const chunk of requested.current) {
      if (chunk >= firstChunk - KEEP_CHUNKS && chunk <= lastChunk + KEEP_CHUNKS) {
        continue
      }
      const from = chunk * CHUNK_SIZE
      for (let i = from; i < from + CHUNK_SIZE; i++) rows.current.delete(i)
      requested.current.delete(chunk)
    }
  }, [dataSource, startIndex, endIndex, totalCount])

  /**
   * undefined means "not arrived yet" — the caller renders a placeholder.
   * Every window is potentially incomplete by design; the demo fakes latency
   * precisely so this path is exercised from day one.
   */
  const getRow = useCallback(
    (index: number): Row | undefined => rows.current.get(index),
    // `version` is unused in the body, but it is what gives this callback a new
    // identity when rows land, so React re-renders and picks them up.
    [version],
  )

  /**
   * Optimistic: update the local cache immediately, then persist. Awaiting the
   * write matters because eviction can drop a row from the cache — the edit
   * must reach the source before that can happen.
   */
  const applyEdits = useCallback(
    async (diffs: CellDiff[]) => {
      for (const diff of diffs) {
        const row = rows.current.get(diff.rowIndex)
        if (row) row.cells[diff.columnKey] = diff.after
      }
      setVersion((v) => v + 1)
      await dataSource.applyEdits(diffs)
    },
    [dataSource],
  )

  return { totalCount, getRow, applyEdits }
}
