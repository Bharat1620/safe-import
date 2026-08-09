import { useCallback, useRef, useState } from "react";
import type { CellDiff } from "./types";

/**
 * A stack of commands, where one command is an array of cell diffs — so a
 * 10,000-cell paste is one undoable entry and memory scales with edits made
 * rather than dataset size. Undo is the same diffs applied with before/after
 * swapped, which is why no reverse operations exist.
 */
export function useUndoStack(apply: (diffs: CellDiff[]) => Promise<void>) {
  const [stack, setStack] = useState<CellDiff[][]>([]);

  /** Position in history, not stack length. Undo moves it without deleting,
   *  which is what makes redo possible. */
  const [pointer, setPointer] = useState(0);

  /** Each apply is async; without this, holding Ctrl+Z fires two undos against
   *  the same pointer. */
  const busy = useRef(false);

  const push = useCallback(
    async (diffs: CellDiff[]) => {
      if (diffs.length === 0 || busy.current) return;
      busy.current = true;
      try {
        await apply(diffs);
        // slice discards the redo branch: editing after undoing makes those
        // commands unreachable, since their `before` describes a lost timeline.
        setStack((s) => [...s.slice(0, pointer), diffs]);
        setPointer((p) => p + 1);
      } finally {
        busy.current = false;
      }
    },
    [apply, pointer]
  );

  const invert = (diffs: CellDiff[]): CellDiff[] =>
    diffs.map((d) => ({ ...d, before: d.after, after: d.before }));

  const undo = useCallback(async () => {
    if (pointer === 0 || busy.current) return;
    busy.current = true;
    try {
      await apply(invert(stack[pointer - 1]));
      setPointer((p) => p - 1);
    } finally {
      busy.current = false;
    }
  }, [apply, pointer, stack]);

  const redo = useCallback(async () => {
    if (pointer >= stack.length || busy.current) return;
    busy.current = true;
    try {
      await apply(stack[pointer]);
      setPointer((p) => p + 1);
    } finally {
      busy.current = false;
    }
  }, [apply, pointer, stack]);

  return {
    push,
    undo,
    redo,
    canUndo: pointer > 0,
    canRedo: pointer < stack.length,
    depth: pointer,
  };
}
