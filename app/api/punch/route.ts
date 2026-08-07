import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { validateAny, getPunchSecret, type ValidationFailureReason } from "@/lib/token";
import { punch, weekDates, dateKey, totalsFor, type Staff } from "@/lib/attendance";
import { rowToStaff, rowToShift, rowToSession, type StaffRow, type ShiftRow, type SessionRow } from "@/lib/attendance-db";
import { isRateLimited, recordFailure, clearFailures, requestIp } from "@/lib/rate-limit";

const SITE_ID = process.env.SITE_ID || "CAFE01";

type FailureReason =
  | ValidationFailureReason
  | "bad-pin"
  | "cooldown"
  | "inactive-staff"
  | "unknown-staff"
  | "conflict";

const FAILURE_MESSAGES: Record<FailureReason, string> = {
  expired: "That code has expired. Look at the tablet for the current one.",
  "wrong-site": "That code belongs to a different site.",
  "bad-token": "That code isn't valid here.",
  "not-a-cafe-code": "That's not a punch code.",
  unreadable: "Couldn't read that code.",
  "bad-pin": "PIN not recognised.",
  cooldown: "Just a moment before scanning again.",
  "inactive-staff": "That account is switched off. Speak to your manager.",
  "unknown-staff": "Couldn't record that punch.",
  conflict: "That just got recorded by another request. Check the floor list.",
};

function fail(reason: FailureReason, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, reason, message: FAILURE_MESSAGES[reason], ...extra });
}

export async function POST(request: Request) {
  let body: { code?: unknown; pin?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("unreadable");
  }

  // The server's clock is the only clock -- never trust a client timestamp
  // for a punch decision.
  const now = Date.now();

  const admin = createSupabaseAdminClient();

  const { data: settingsRow, error: settingsError } = await admin
    .from("settings")
    .select("*")
    .eq("site_id", SITE_ID)
    .single();
  if (settingsError || !settingsRow) {
    return NextResponse.json({ error: "site not configured" }, { status: 500 });
  }

  // Step 2: validate the scanned/typed code against the HMAC token, computed
  // for windowIndex(now) +/- 1.
  const tokenConfig = {
    siteId: SITE_ID,
    secret: getPunchSecret(),
    periodMs: settingsRow.token_period_ms,
  };
  const validation = validateAny(tokenConfig, body.code, now);
  if (!validation.ok) return fail(validation.reason);

  // Step 3: rate-limit PIN attempts by IP, before touching the PIN itself.
  const ip = requestIp(request.headers);
  if (isRateLimited(ip, now)) {
    return NextResponse.json({ ok: false, reason: "rate-limited" }, { status: 429 });
  }

  // Step 4: identify the staff member by PIN. Compare against every active
  // staff member's hash rather than looking one up by name/id first, so a
  // failed attempt never reveals whether a given PIN exists.
  const { data: staffRows } = await admin
    .from("staff")
    .select("id, name, role, pin_hash, active")
    .eq("site_id", SITE_ID)
    .eq("active", true);

  const pin = typeof body.pin === "string" ? body.pin : "";
  let matched: StaffRow | null = null;
  for (const row of (staffRows as StaffRow[] | null) ?? []) {
    if (await bcrypt.compare(pin, row.pin_hash ?? "")) {
      matched = row;
      break;
    }
  }
  if (!matched) {
    recordFailure(ip, now);
    return fail("bad-pin");
  }
  clearFailures(ip);

  // Step 5: load this staff member's open session (if any) and shifts
  // spanning today and yesterday, so overnight shifts/sessions match.
  const todayKey = dateKey(new Date(now));
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dateKey(yesterday);

  const [{ data: shiftRows }, { data: sessionRows }] = await Promise.all([
    admin.from("shifts").select("*").eq("staff_id", matched.id).in("date", [yesterdayKey, todayKey]),
    admin
      .from("sessions")
      .select("*")
      .eq("staff_id", matched.id)
      .or(`out_at.is.null,date.gte.${yesterdayKey}`),
  ]);

  const shifts = ((shiftRows as ShiftRow[] | null) ?? []).map(rowToShift);
  const sessions = ((sessionRows as SessionRow[] | null) ?? []).map(rowToSession);
  const engineStaff: Staff[] = [rowToStaff(matched)];

  // Step 6: run the ported engine with the server's `now`.
  const result = punch({
    staff: engineStaff,
    sessions,
    shifts,
    staffId: matched.id,
    now,
    settings: { graceMin: settingsRow.grace_min, cooldownSec: settingsRow.cooldown_sec },
  });

  if (!result.ok) {
    if (result.reason === "cooldown") {
      return fail("cooldown", { waitMs: result.waitMs });
    }
    return fail(result.reason);
  }

  // Step 7: write the insert or update. The partial unique index on
  // sessions(staff_id) WHERE out_at IS NULL is the actual concurrency
  // guard; a losing concurrent request gets a friendly message, not a 500.
  if (result.action === "in") {
    const { error } = await admin.from("sessions").insert({
      staff_id: matched.id,
      date: result.session.date,
      in_at: new Date(result.session.inAt).toISOString(),
      in_flag: result.session.inFlag,
      shift_id: result.session.shiftId,
    });
    if (error) {
      if (error.code === "23505") return fail("conflict");
      return NextResponse.json({ error: "write failed" }, { status: 500 });
    }
  } else {
    const { data: updated, error } = await admin
      .from("sessions")
      .update({ out_at: new Date(result.session.outAt as number).toISOString(), out_flag: result.session.outFlag })
      .eq("id", result.session.id)
      .is("out_at", null)
      .select("id");
    if (error) {
      return NextResponse.json({ error: "write failed" }, { status: 500 });
    }
    if (!updated || updated.length === 0) return fail("conflict");
  }

  // Step 8: return the friendly summary, recomputing totals from the fresh
  // week's sessions so the just-written punch is included.
  const days = weekDates(new Date(now));
  const { data: weekRows } = await admin
    .from("sessions")
    .select("*")
    .eq("staff_id", matched.id)
    .in("date", days);
  const weekSessions = ((weekRows as SessionRow[] | null) ?? []).map(rowToSession);
  const todayMinutes = totalsFor(weekSessions, matched.id, [todayKey], now, settingsRow.round_step).minutes;
  const weekMinutes = totalsFor(weekSessions, matched.id, days, now, settingsRow.round_step).minutes;

  return NextResponse.json({
    ok: true,
    action: result.action,
    name: matched.name,
    at: result.action === "in" ? result.session.inAt : result.session.outAt,
    flag: result.flag,
    todayMinutes,
    weekMinutes,
  });
}
