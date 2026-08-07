import "server-only";
import crypto from "node:crypto";

/**
 * HMAC-based punch token. Replaces the prototype's FNV-1a hash, which only
 * existed because the prototype had to generate *and* validate the code in
 * the browser with no secret. Here the secret never leaves the server: the
 * kiosk asks this module for the current code, the phone posts back what it
 * scanned or typed, and only this module (called from /api/punch) decides
 * whether it's valid.
 */

const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/1/8/I/O -- easy to type off a screen

export interface TokenConfig {
  siteId: string;
  secret: string;
  periodMs: number;
}

export function getPunchSecret(): string {
  const secret = process.env.PUNCH_TOKEN_SECRET;
  if (!secret) throw new Error("PUNCH_TOKEN_SECRET is not set");
  return secret;
}

export const windowIndex = (ts: number, periodMs: number) => Math.floor(ts / periodMs);

/**
 * Derives a 10-character base32 code from HMAC-SHA256(secret, windowIndex).
 * Base32 packs 5 bits/char, so 10 chars = 50 bits -- we fold the 256-bit
 * digest down to the top 50 bits of its first 7 bytes to get there.
 */
export function tokenForWindow(secret: string, win: number): string {
  const mac = crypto.createHmac("sha256", secret).update(String(win)).digest();
  let bits = BigInt(0);
  for (let i = 0; i < 7; i++) bits = (bits << BigInt(8)) | BigInt(mac[i]);
  bits >>= BigInt(6); // 56 bits -> top 50 bits
  let out = "";
  for (let i = 9; i >= 0; i--) {
    const idx = Number((bits >> BigInt(i * 5)) & BigInt(0x1f));
    out += B32[idx];
  }
  return out;
}

export function buildPayload(cfg: TokenConfig, ts: number): string {
  const w = windowIndex(ts, cfg.periodMs);
  return `CAFEPUNCH|1|${cfg.siteId}|${w}|${tokenForWindow(cfg.secret, w)}`;
}

export type ValidationFailureReason =
  | "unreadable"
  | "not-a-cafe-code"
  | "wrong-site"
  | "expired"
  | "bad-token";

export type ValidationResult = { ok: true } | { ok: false; reason: ValidationFailureReason };

export function validateToken(
  cfg: TokenConfig,
  payload: unknown,
  ts: number,
  grace = 1
): ValidationResult {
  if (typeof payload !== "string") return { ok: false, reason: "unreadable" };
  const p = payload.trim().split("|");
  if (p.length !== 5 || p[0] !== "CAFEPUNCH") return { ok: false, reason: "not-a-cafe-code" };
  if (p[2] !== cfg.siteId) return { ok: false, reason: "wrong-site" };
  const claimed = Number(p[3]);
  if (!Number.isFinite(claimed)) return { ok: false, reason: "unreadable" };
  if (Math.abs(windowIndex(ts, cfg.periodMs) - claimed) > grace) return { ok: false, reason: "expired" };
  if (tokenForWindow(cfg.secret, claimed) !== p[4]) return { ok: false, reason: "bad-token" };
  return { ok: true };
}

/** Accepts either a full scanned payload or a hand-typed 10-character code. */
export function validateAny(
  cfg: TokenConfig,
  input: unknown,
  ts: number,
  grace = 1
): ValidationResult {
  const raw = (typeof input === "string" ? input : "").trim();
  if (!raw) return { ok: false, reason: "unreadable" };
  if (raw.includes("|")) return validateToken(cfg, raw, ts, grace);
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 10) return { ok: false, reason: "unreadable" };
  const now = windowIndex(ts, cfg.periodMs);
  for (let d = -grace; d <= grace; d++) {
    if (tokenForWindow(cfg.secret, now + d) === code) return { ok: true };
  }
  return { ok: false, reason: "expired" };
}
