import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { FakeDB, fakeAdminClient } from "./helpers/fake-supabase";
import { buildPayload, tokenForEpoch, type TokenConfig } from "../lib/token";
import { CODE_LENGTH } from "../lib/punch-constants";

process.env.PUNCH_TOKEN_SECRET = "test-punch-secret";

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => (globalThis as unknown as { __fakeAdmin: unknown }).__fakeAdmin,
}));

const { POST } = await import("../app/api/punch/route");

const SITE_ID = "CAFE01";
const EPOCH = 1;
const PIN = "1234";
const cfg: TokenConfig = { siteId: SITE_ID, secret: "test-punch-secret", epoch: EPOCH };

let db: FakeDB;

function makeDb(): FakeDB {
  const database = new FakeDB();
  database.tables.settings.rows.push({
    site_id: SITE_ID,
    cafe_name: "Test Cafe",
    grace_min: 5,
    round_step: 1,
    cooldown_sec: 60,
    token_epoch: EPOCH,
    timezone: "UTC",
  });
  database.tables.staff.rows.push({
    id: "staff-1",
    site_id: SITE_ID,
    name: "Amina Yusuf",
    role: "Barista",
    pin_hash: bcrypt.hashSync(PIN, 4),
    active: true,
  });
  return database;
}

function setDb() {
  db = makeDb();
  (globalThis as unknown as { __fakeAdmin: unknown }).__fakeAdmin = fakeAdminClient(db);
}

function req(body: unknown, ip = "1.2.3.4") {
  return new Request("http://localhost/api/punch", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/punch", () => {
  beforeEach(() => {
    setDb();
  });

  it("rejects a code from a previous epoch (rotated/stale)", async () => {
    const staleEpoch = EPOCH - 1;
    const code = `CAFEPUNCH|1|${SITE_ID}|${staleEpoch}|${tokenForEpoch(cfg.secret, staleEpoch)}`;
    const res = await POST(req({ code, pin: PIN }));
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, reason: "stale" });
    expect(res.status).toBe(200);
  });

  it("rejects a code from another site", async () => {
    const payload = buildPayload({ ...cfg, siteId: "OTHER-SITE" });
    const res = await POST(req({ code: payload, pin: PIN }));
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, reason: "wrong-site" });
  });

  it("rejects a forged token even with the current epoch", async () => {
    const forged = `CAFEPUNCH|1|${SITE_ID}|${EPOCH}|${"Z".repeat(CODE_LENGTH)}`;
    const res = await POST(req({ code: forged, pin: PIN }));
    const json = await res.json();
    expect(json).toMatchObject({ ok: false, reason: "bad-token" });
  });

  it("ignores a client-supplied timestamp when deciding the punch", async () => {
    const payload = buildPayload(cfg);
    const spoofedNow = Date.now() - 1000 * 60 * 60 * 24 * 30; // "a month ago"
    const res = await POST(req({ code: payload, pin: PIN, now: spoofedNow }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(db.tables.sessions.rows).toHaveLength(1);
    const written = db.tables.sessions.rows[0];
    expect(Math.abs(new Date(written.in_at as string).getTime() - Date.now())).toBeLessThan(5000);
    expect(written.in_flag).not.toBeUndefined();
  });

  it("lets exactly one of two concurrent punches open a session, not two", async () => {
    const payload = buildPayload(cfg);
    const [r1, r2] = await Promise.all([
      POST(req({ code: payload, pin: PIN })),
      POST(req({ code: payload, pin: PIN })),
    ]);
    const [j1, j2] = await Promise.all([r1.json(), r2.json()]);
    const outcomes = [j1, j2];
    expect(outcomes.filter((o) => o.ok === true)).toHaveLength(1);
    expect(outcomes.filter((o) => o.ok === false && o.reason === "conflict")).toHaveLength(1);
    expect(db.tables.sessions.rows.filter((r) => r.out_at == null)).toHaveLength(1);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it("accepts a correct PIN and code, then rejects a bad PIN without revealing why", async () => {
    const payload = buildPayload(cfg);
    const bad = await POST(req({ code: payload, pin: "9999" }));
    const badJson = await bad.json();
    expect(badJson).toMatchObject({ ok: false, reason: "bad-pin" });
  });
});
