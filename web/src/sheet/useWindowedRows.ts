import { useCallback, useEffect, useRef, useState } from "react";
import { CHUNK_SIZE, KEEP_CHUNKS } from "./constants";
import type { CellDiff, Row, SheetDataSource } from "./types";

/** Owns which rows exist and whether they have arrived. Knows nothing about rendering. */
export function useWindowedRows(
  dataSource: SheetDataSource,
  startIndex: number,
  endIndex: number
) {
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Refs, not state: these change constantly and we want one deliberate render
  // per arrival rather than copying a Map for object identity every time.
  const rows = useRef(new Map<number, Row>());
  /** Chunks already *asked for*, recorded before the request resolves so
   *  scrolling during a 40ms fetch doesn't fire duplicates. */
  const requested = useRef(new Set<number>());

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    dataSource.getTotalCount().then((count) => {
      if (!cancelled) setTotalCount(count);
    });
    return () => {
      cancelled = true;
      rows.current.clear();
      requested.current.clear();
    };
  }, [dataSource]);

  useEffect(() => {
    if (totalCount === null) return;

    const firstChunk = Math.floor(startIndex / CHUNK_SIZE);
    // endIndex is exclusive; max() guards endIndex 0 asking for a negative offset.
    const lastChunk = Math.floor(
      Math.max(startIndex, endIndex - 1) / CHUNK_SIZE
    );

    for (let chunk = firstChunk; chunk <= lastChunk; chunk++) {
      if (requested.current.has(chunk)) continue;
      requested.current.add(chunk);

      dataSource.getRows(chunk * CHUNK_SIZE, CHUNK_SIZE).then((fetched) => {
        for (const row of fetched) rows.current.set(row.index, row);
        setVersion((v) => v + 1);
      });
    }

    // Both structures must be cleared together, or an evicted chunk stays
    // marked as requested and shows placeholders forever.
    for (const chunk of requested.current) {
      if (
        chunk >= firstChunk - KEEP_CHUNKS &&
        chunk <= lastChunk + KEEP_CHUNKS
      ) {
        continue;
      }
      const from = chunk * CHUNK_SIZE;
      for (let i = from; i < from + CHUNK_SIZE; i++) rows.current.delete(i);
      requested.current.delete(chunk);
    }
  }, [dataSource, startIndex, endIndex, totalCount]);

  /** undefined means not arrived yet — the caller renders a placeholder. */
  const getRow = useCallback(
    (index: number): Row | undefined => rows.current.get(index),
    // Unused in the body; it is what gives this a new identity when rows land.
    [version]
  );

  /** Optimistic. Awaited because eviction must not drop an unsaved edit. */
  const applyEdits = useCallback(
    async (diffs: CellDiff[]) => {
      for (const diff of diffs) {
        const row = rows.current.get(diff.rowIndex);
        if (row) row.cells[diff.columnKey] = diff.after;
      }
      setVersion((v) => v + 1);
      await dataSource.applyEdits(diffs);
    },
    [dataSource]
  );

  return { totalCount, getRow, applyEdits };
}
