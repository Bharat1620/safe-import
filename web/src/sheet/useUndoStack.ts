import { useCallback, useRef, useState } from 'react'
import type { CellDiff } from './types'

/**
 * Undo as a stack of *commands*, where one command is an array of cell diffs.
 *
 * The key property: a 10,000-cell paste is ONE entry holding 10,000 small
 * {before, after} records — not a snapshot of the dataset. Memory grows with
 * how much you changed, never with how big the data is, so undo depth costs the
 * same on a 500-row import as on a 500,000-row one.
 *
 * Undo is the same diffs applied with before/after swapped. No reverse
 * operations to write, no special cases.
 */
export function useUndoStack(apply: (diffs: CellDiff[]) => Promise<void>) {
  const [stack, setStack] = useState<CellDiff[][]>([])

  /** Position in history, not stack length. Undo decrements without deleting,
   *  which is what makes redo possible. */
  const [pointer, setPointer] = useState(0)

  /** Each apply is async; without this, mashing Ctrl+Z fires two undos against
   *  the same pointer value and history corrupts. */
  const busy = useRef(false)

  const push = useCallback(
    async (diffs: CellDiff[]) => {
      if (diffs.length === 0 || busy.current) return
      busy.current = true
      try {
        await apply(diffs)
        // A new command after undoing discards the redo branch — standard
        // editor behaviour, and it keeps history a stack rather than a tree.
        setStack((s) => [...s.slice(0, pointer), diffs])
        setPointer((p) => p + 1)
      } finally {
        busy.current = false
      }
    },
    [apply, pointer],
  )

  const invert = (diffs: CellDiff[]): CellDiff[] =>
    diffs.map((d) => ({ ...d, before: d.after, after: d.before }))

  const undo = useCallback(async () => {
    if (pointer === 0 || busy.current) return
    busy.current = true
    try {
      await apply(invert(stack[pointer - 1]))
      setPointer((p) => p - 1)
    } finally {
      busy.current = false
    }
  }, [apply, pointer, stack])

  const redo = useCallback(async () => {
    if (pointer >= stack.length || busy.current) return
    busy.current = true
    try {
      await apply(stack[pointer])
      setPointer((p) => p + 1)
    } finally {
      busy.current = false
    }
  }, [apply, pointer, stack])

  return {
    push,
    undo,
    redo,
    canUndo: pointer > 0,
    canRedo: pointer < stack.length,
    depth: pointer,
  }
}
