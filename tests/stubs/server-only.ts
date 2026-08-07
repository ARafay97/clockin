// Vitest runs everything in one Node process, so there's no client/server
// bundle split for the real `server-only` package to guard against. This
// stub keeps the import a no-op under test; Next.js still uses the real
// package (and its guard) in the actual app build.
export {};
