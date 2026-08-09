import { describe, it, expect } from "vitest";
import { tokenForEpoch, buildPayload, validateToken, validateAny, type TokenConfig } from "../lib/token";
import { CODE_LENGTH } from "../lib/punch-constants";

const cfg: TokenConfig = { siteId: "CAFE01", secret: "s3cr3t-test-key", epoch: 1 };
const otherSite: TokenConfig = { ...cfg, siteId: "CAFE02" };
const rotated: TokenConfig = { ...cfg, epoch: 2 };

describe("token generation", () => {
  it("is deterministic for the same secret and epoch", () => {
    expect(tokenForEpoch(cfg.secret, 42)).toBe(tokenForEpoch(cfg.secret, 42));
  });

  it(`produces a ${CODE_LENGTH}-character code`, () => {
    expect(tokenForEpoch(cfg.secret, 42)).toHaveLength(CODE_LENGTH);
  });

  it("differs across epochs and secrets", () => {
    expect(tokenForEpoch(cfg.secret, 1)).not.toBe(tokenForEpoch(cfg.secret, 2));
    expect(tokenForEpoch(cfg.secret, 1)).not.toBe(tokenForEpoch("different-secret", 1));
  });
});

describe("validateToken", () => {
  it("accepts a freshly built payload", () => {
    const payload = buildPayload(cfg);
    expect(validateToken(cfg, payload)).toEqual({ ok: true });
  });

  it("rejects a payload from a different site", () => {
    const payload = buildPayload(otherSite);
    expect(validateToken(cfg, payload)).toEqual({ ok: false, reason: "wrong-site" });
  });

  it("rejects a payload from a previous epoch as stale, with no grace period", () => {
    const payload = buildPayload(cfg); // epoch 1
    expect(validateToken(rotated, payload)).toEqual({ ok: false, reason: "stale" });
  });

  it("accepts the new payload immediately after a rotation", () => {
    const payload = buildPayload(rotated);
    expect(validateToken(rotated, payload)).toEqual({ ok: true });
  });

  it("rejects a forged token with the correct epoch", () => {
    const forged = `CAFEPUNCH|1|${cfg.siteId}|${cfg.epoch}|${"A".repeat(CODE_LENGTH)}`;
    expect(validateToken(cfg, forged)).toEqual({ ok: false, reason: "bad-token" });
  });

  it("rejects malformed payloads as unreadable or not-a-cafe-code", () => {
    expect(validateToken(cfg, "garbage")).toEqual({ ok: false, reason: "not-a-cafe-code" });
    expect(validateToken(cfg, 12345 as unknown)).toEqual({ ok: false, reason: "unreadable" });
  });
});

describe("validateAny (typed fallback code)", () => {
  it(`accepts the current ${CODE_LENGTH}-character typed code`, () => {
    const code = tokenForEpoch(cfg.secret, cfg.epoch);
    expect(validateAny(cfg, code)).toEqual({ ok: true });
  });

  it("is case-insensitive and strips stray characters", () => {
    const code = tokenForEpoch(cfg.secret, cfg.epoch);
    expect(validateAny(cfg, ` ${code.toLowerCase()} `)).toEqual({ ok: true });
  });

  it("rejects a code of the wrong length as unreadable", () => {
    expect(validateAny(cfg, "A".repeat(CODE_LENGTH - 1))).toEqual({ ok: false, reason: "unreadable" });
  });

  it("rejects a code from before a rotation as stale", () => {
    const oldCode = tokenForEpoch(cfg.secret, cfg.epoch);
    expect(validateAny(rotated, oldCode)).toEqual({ ok: false, reason: "stale" });
  });
});
