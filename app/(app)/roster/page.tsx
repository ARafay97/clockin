import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rosterWeek, weekDates } from "@/lib/attendance";
import { rowToStaff, rowToShift, rowToSession } from "@/lib/attendance-db";
import { RosterClient } from "./RosterClient";

const SITE_ID = process.env.SITE_ID || "CAFE01";

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const { offset: offsetStr } = await searchParams;
  const offset = Number(offsetStr) || 0;

  const anchor = new Date();
  anchor.setDate(anchor.getDate() + offset * 7);
  const days = weekDates(anchor);

  const admin = createSupabaseAdminClient();
  const [{ data: staffRows }, { data: settingsRow }] = await Promise.all([
    admin.from("staff").select("*").eq("site_id", SITE_ID).eq("active", true).order("name"),
    admin.from("settings").select("*").eq("site_id", SITE_ID).single(),
  ]);

  const staff = (staffRows ?? []).map(rowToStaff);
  const roundStep = settingsRow?.round_step ?? 1;
  const staffIds = staff.map((s) => s.id);

  const [{ data: shiftRows }, { data: sessionRows }] = await Promise.all([
    admin.from("shifts").select("*").in("date", days).in("staff_id", staffIds),
    admin.from("sessions").select("*").in("date", days).in("staff_id", staffIds),
  ]);

  const shifts = (shiftRows ?? []).map(rowToShift);
  const sessions = (sessionRows ?? []).map(rowToSession);
  // Server Component render, once per request -- this is the server's
  // clock reading the actual current time, not a client re-render hazard.
  // eslint-disable-next-line react-hooks/purity
  const grid = rosterWeek({ staff, shifts, sessions, anchor, now: Date.now(), step: roundStep });

  const supabaseAuth = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  return <RosterClient grid={grid} unlocked={!!user} offset={offset} />;
}
