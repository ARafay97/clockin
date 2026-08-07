import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildPayload, getPunchSecret } from "@/lib/token";
import { dateKey, sessionMinutes, roundTo, type Session } from "@/lib/attendance";
import { isValidDeviceToken } from "@/lib/kiosk-auth";

export const dynamic = "force-dynamic";

const SITE_ID = process.env.SITE_ID || "CAFE01";

/**
 * Everything the kiosk tablet shows lives behind this one device-token gate
 * -- the rotating code, who's currently on the floor, and today's totals --
 * rather than adding a second, ungated endpoint for the floor list.
 */
export async function GET(request: NextRequest) {
  const device = request.nextUrl.searchParams.get("device");
  if (!isValidDeviceToken(device)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: settingsRow, error: settingsError } = await admin
    .from("settings")
    .select("*")
    .eq("site_id", SITE_ID)
    .single();
  if (settingsError || !settingsRow) {
    return NextResponse.json({ error: "site not configured" }, { status: 500 });
  }

  const now = Date.now();
  const tokenConfig = { siteId: SITE_ID, secret: getPunchSecret(), periodMs: settingsRow.token_period_ms };
  const payload = buildPayload(tokenConfig, now);
  const code = payload.split("|")[4];
  const msLeft = settingsRow.token_period_ms - (now % settingsRow.token_period_ms);

  const today = dateKey(new Date(now));
  const [{ data: staffRows }, { data: openRows }, { data: todayRows }] = await Promise.all([
    admin.from("staff").select("id, name").eq("site_id", SITE_ID).eq("active", true),
    admin.from("sessions").select("*").is("out_at", null),
    admin.from("sessions").select("*").eq("date", today),
  ]);

  const nameOf = (id: string) => (staffRows ?? []).find((s: { id: string }) => s.id === id)?.name || "Unknown";

  const onFloor = ((openRows as { id: string; staff_id: string; in_at: string; in_flag: string }[] | null) ?? [])
    .filter((r) => (staffRows ?? []).some((s: { id: string }) => s.id === r.staff_id))
    .map((r) => ({
      staffId: r.staff_id,
      name: nameOf(r.staff_id),
      inAt: new Date(r.in_at).getTime(),
      inFlag: r.in_flag,
      minutes: roundTo(sessionMinutes({ inAt: new Date(r.in_at).getTime(), outAt: null } as Session, now), settingsRow.round_step),
    }))
    .sort((a, b) => a.inAt - b.inAt);

  const byStaff = new Map<string, Session[]>();
  for (const r of (todayRows as { id: string; staff_id: string; in_at: string; out_at: string | null }[] | null) ?? []) {
    const list = byStaff.get(r.staff_id) ?? [];
    list.push({
      id: r.id,
      staffId: r.staff_id,
      date: today,
      inAt: new Date(r.in_at).getTime(),
      outAt: r.out_at ? new Date(r.out_at).getTime() : null,
      inFlag: "on-time",
      outFlag: null,
      shiftId: null,
    });
    byStaff.set(r.staff_id, list);
  }
  const todaySummary = (staffRows ?? [])
    .map((s: { id: string; name: string }) => {
      const list = byStaff.get(s.id) ?? [];
      if (!list.length) return null;
      const raw = list.reduce((sum, sess) => sum + sessionMinutes(sess, now), 0);
      return {
        staffId: s.id,
        name: s.name,
        minutes: roundTo(raw, settingsRow.round_step),
        open: list.some((sess) => sess.outAt == null),
      };
    })
    .filter((x: unknown): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({
    payload,
    code,
    msLeft,
    period: settingsRow.token_period_ms,
    cafeName: settingsRow.cafe_name,
    now,
    onFloor,
    today: todaySummary,
  });
}
