import { describe, it, expect } from "vitest";
import { tokenForWindow, buildPayload, validateToken, validateAny, windowIndex, type TokenConfig } from "../lib/token";
import { CODE_LENGTH } from "../lib/punch-constants";

const cfg: TokenConfig = { siteId: "CAFE01", secret: "s3cr3t-test-key", periodMs: 60000 };
const otherSite: TokenConfig = { ...cfg, siteId: "CAFE02" };

describe("token generation", () => {
  it("is deterministic for the same secret and window", () => {
    expect(tokenForWindow(cfg.secret, 42)).toBe(tokenForWindow(cfg.secret, 42));
  });

  it(`produces a ${CODE_LENGTH}-character code`, () => {
    expect(tokenForWindow(cfg.secret, 42)).toHaveLength(CODE_LENGTH);
  });

  it("differs across windows and secrets", () => {
    expect(tokenForWindow(cfg.secret, 42)).not.toBe(tokenForWindow(cfg.secret, 43));
    expect(tokenForWindow(cfg.secret, 42)).not.toBe(tokenForWindow("different-secret", 42));
  });
});

describe("validateToken", () => {
  const ts = 1000 * 60000; // exactly window 1000

  it("accepts a freshly built payload", () => {
    const payload = buildPayload(cfg, ts);
    expect(validateToken(cfg, payload, ts)).toEqual({ ok: true });
  });

  it("rejects a payload from a different site", () => {
    const payload = buildPayload(otherSite, ts);
    expect(validateToken(cfg, payload, ts)).toEqual({ ok: false, reason: "wrong-site" });
  });

  it("accepts within the +/-1 window grace", () => {
    const payload = buildPayload(cfg, ts);
    expect(validateToken(cfg, payload, ts + cfg.periodMs)).toEqual({ ok: true });
    expect(validateToken(cfg, payload, ts - cfg.periodMs)).toEqual({ ok: true });
  });

  it("rejects beyond the grace window as expired", () => {
    const payload = buildPayload(cfg, ts);
    expect(validateToken(cfg, payload, ts + 2 * cfg.periodMs)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a forged token with a valid window index", () => {
    const w = windowIndex(ts, cfg.periodMs);
    const forged = `CAFEPUNCH|1|${cfg.siteId}|${w}|${"A".repeat(CODE_LENGTH)}`;
    expect(validateToken(cfg, forged, ts)).toEqual({ ok: false, reason: "bad-token" });
  });

  it("rejects malformed payloads as unreadable or not-a-cafe-code", () => {
    expect(validateToken(cfg, "garbage", ts)).toEqual({ ok: false, reason: "not-a-cafe-code" });
    expect(validateToken(cfg, 12345 as unknown, ts)).toEqual({ ok: false, reason: "unreadable" });
  });
});

describe("validateAny (typed fallback code)", () => {
  const ts = 2000 * 60000;

  it(`accepts the current ${CODE_LENGTH}-character typed code`, () => {
    const code = tokenForWindow(cfg.secret, windowIndex(ts, cfg.periodMs));
    expect(validateAny(cfg, code, ts)).toEqual({ ok: true });
  });

  it("is case-insensitive and strips stray characters", () => {
    const code = tokenForWindow(cfg.secret, windowIndex(ts, cfg.periodMs));
    expect(validateAny(cfg, ` ${code.toLowerCase()} `, ts)).toEqual({ ok: true });
  });

  it("rejects a code of the wrong length as unreadable", () => {
    expect(validateAny(cfg, "A".repeat(CODE_LENGTH - 1), ts)).toEqual({ ok: false, reason: "unreadable" });
  });
});
