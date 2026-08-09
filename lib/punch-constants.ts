/**
 * Length of the human-typeable punch code, in base32 characters (5 bits
 * each). Shared between lib/token.ts (server-only) and the client-side
 * punch form, so it can't live in lib/token.ts itself -- importing that
 * from a Client Component would trip its `server-only` guard.
 *
 * The code is now static (printed, not time-rotating -- see lib/token.ts),
 * so it stays valid indefinitely between manual rotations rather than for
 * ~60 seconds. 8 chars (40 bits, ~1.1 trillion combinations) instead of 6
 * keeps it comfortably out of brute-force range for something with an
 * unbounded guessing window, while still being short enough to type off a
 * printed sheet by hand.
 */
export const CODE_LENGTH = 8;
