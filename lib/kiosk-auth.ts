import crypto from "node:crypto";

/**
 * Anyone who opens /kiosk?device=<token> can display valid punch codes, so
 * the token is checked with a constant-time comparison rather than `===`.
 */
export function isValidDeviceToken(token: string | null | undefined): boolean {
  const expected = process.env.KIOSK_DEVICE_TOKEN;
  if (!expected || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
