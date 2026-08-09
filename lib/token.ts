import "server-only";
import crypto from "node:crypto";
import { CODE_LENGTH } from "@/lib/punch-constants";

/**
 * HMAC-based punch code. The code is static -- meant to be printed and
 * posted at the cafe -- not time-rotating. It only changes when a manager
 * explicitly rotates it (POST /api/admin/rotate-code), which bumps the
 * epoch stored in settings.token_epoch; a stale printed sheet then fails
 * immediately, with no grace period, since a manual rotation is a
 * deliberate "invalidate this now" action. The secret never leaves the
 * server: the kiosk asks this module for the current code, the phone posts
 * back what it scanned or typed, and only this module (called from
 * /api/punch) decides whether it's valid.
 */

const B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/1/8/I/O -- easy to type off a screen

export interface TokenConfig {
  siteId: string;
  secret: string;
  epoch: number;
}

export function getPunchSecret(): string {
  const secret = process.env.PUNCH_TOKEN_SECRET;
  if (!secret) throw new Error("PUNCH_TOKEN_SECRET is not set");
  return secret;
}

const CODE_BITS = CODE_LENGTH * 5; // base32 packs 5 bits/char
const CODE_BYTES = Math.ceil(CODE_BITS / 8);

/**
 * Derives a CODE_LENGTH-character base32 code from
 * HMAC-SHA256(secret, epoch) -- folds the 256-bit digest down to the top
 * CODE_BITS bits of its first CODE_BYTES bytes to get there.
 */
export function tokenForEpoch(secret: string, epoch: number): string {
  const mac = crypto.createHmac("sha256", secret).update(String(epoch)).digest();
  let bits = BigInt(0);
  for (let i = 0; i < CODE_BYTES; i++) bits = (bits << BigInt(8)) | BigInt(mac[i]);
  bits >>= BigInt(CODE_BYTES * 8 - CODE_BITS); // drop down to exactly CODE_BITS bits
  let out = "";
  for (let i = CODE_LENGTH - 1; i >= 0; i--) {
    const idx = Number((bits >> BigInt(i * 5)) & BigInt(0x1f));
    out += B32[idx];
  }
  return out;
}

export function buildPayload(cfg: TokenConfig): string {
  return `CAFEPUNCH|1|${cfg.siteId}|${cfg.epoch}|${tokenForEpoch(cfg.secret, cfg.epoch)}`;
}

export type ValidationFailureReason =
  | "unreadable"
  | "not-a-cafe-code"
  | "wrong-site"
  | "stale"
  | "bad-token";

export type ValidationResult = { ok: true } | { ok: false; reason: ValidationFailureReason };

export function validateToken(cfg: TokenConfig, payload: unknown): ValidationResult {
  if (typeof payload !== "string") return { ok: false, reason: "unreadable" };
  const p = payload.trim().split("|");
  if (p.length !== 5 || p[0] !== "CAFEPUNCH") return { ok: false, reason: "not-a-cafe-code" };
  if (p[2] !== cfg.siteId) return { ok: false, reason: "wrong-site" };
  const claimedEpoch = Number(p[3]);
  if (!Number.isFinite(claimedEpoch)) return { ok: false, reason: "unreadable" };
  if (claimedEpoch !== cfg.epoch) return { ok: false, reason: "stale" };
  if (tokenForEpoch(cfg.secret, claimedEpoch) !== p[4]) return { ok: false, reason: "bad-token" };
  return { ok: true };
}

/** Accepts either a full scanned payload or a hand-typed CODE_LENGTH-character code. */
export function validateAny(cfg: TokenConfig, input: unknown): ValidationResult {
  const raw = (typeof input === "string" ? input : "").trim();
  if (!raw) return { ok: false, reason: "unreadable" };
  if (raw.includes("|")) return validateToken(cfg, raw);
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== CODE_LENGTH) return { ok: false, reason: "unreadable" };
  return tokenForEpoch(cfg.secret, cfg.epoch) === code ? { ok: true } : { ok: false, reason: "stale" };
}
