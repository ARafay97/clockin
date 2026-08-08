/**
 * Length of the human-typeable punch code, in base32 characters (5 bits
 * each). Shared between lib/token.ts (server-only) and the client-side
 * punch form, so it can't live in lib/token.ts itself -- importing that
 * from a Client Component would trip its `server-only` guard.
 */
export const CODE_LENGTH = 6;
