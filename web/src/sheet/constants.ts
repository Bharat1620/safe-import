/** Fixed, so row N's position is N * ROW_HEIGHT — computable without measuring. */
export const ROW_HEIGHT = 26

/** Rows rendered beyond the viewport so fast scrolling doesn't flash blanks. */
export const OVERSCAN = 8

export const GUTTER_WIDTH = 64

/**
 * Rows *fetched* per request — unrelated to how many are rendered (~40).
 * A round-trip takes longer than scrolling one screen, so chunks are sized to
 * several viewports of runway. Aligned to fixed boundaries (0-199, 200-399...)
 * so each is requested exactly once.
 */
export const CHUNK_SIZE = 200

/**
 * Chunks kept either side of the window; further ones are evicted so heap stays
 * flat on any dataset size. Eviction returns a chunk to the "never fetched"
 * state — scrolling back re-fetches it through the normal path.
 */
export const KEEP_CHUNKS = 3
