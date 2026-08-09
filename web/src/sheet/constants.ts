/**
 * Row height is a constant, deliberately. Variable heights would mean measuring
 * every row to know where row N sits, which defeats the point: with a fixed
 * height, row N is at N * ROW_HEIGHT — computed instantly for any N.
 */
export const ROW_HEIGHT = 26

/** Width of the row-number gutter. Part of the grid's total width. */
export const GUTTER_WIDTH = 64

/**
 * Extra rows rendered above and below the viewport so fast scrolling doesn't
 * flash blanks. Trades DOM nodes for smoothness — tuned against frame rate.
 */
export const OVERSCAN = 8

/**
 * How many rows are *fetched* per request — unrelated to how many are
 * *rendered*. The DOM only ever holds a viewport plus overscan (~40 rows);
 * a chunk is data sitting in a Map, costing no frame time.
 *
 * Fetch generously, render stingily. A round-trip is 30-100ms and scrolling one
 * screen takes less than that, so sizing chunks to the viewport guarantees you
 * are always late: the request starts at the moment you already need it.
 * 200 rows is ~6-8 viewports of runway for ~30KB.
 *
 * Also cheaper server-side: LIMIT 200 costs Postgres about the same as LIMIT 30,
 * since the expense is the round-trip and planning, not the extra rows.
 *
 * Blocks are aligned to fixed boundaries (0-199, 200-399, ...) rather than to
 * the scroll position, so each is requested exactly once and a Set of chunk
 * indices is enough to dedupe. Tune with the benchmark panel.
 */
export const CHUNK_SIZE = 200

/**
 * Chunks kept on either side of the visible window; anything further is evicted,
 * so heap stays flat whether the dataset is 5k rows or 500k.
 *
 * Eviction returns a chunk to the "never fetched" state — there is no separate
 * re-fetch path. Scrolling back to an evicted row shows a placeholder and
 * triggers the same fetch as scrolling into a row for the first time.
 *
 * 3 retains ~1400 rows (~20 screens) in *both* directions, so short scroll-backs
 * are instant and only long jumps re-fetch. Raise it if the benchmark panel
 * shows placeholders during realistic scrolling; 10 costs ~1.5MB, still flat.
 */
export const KEEP_CHUNKS = 3
