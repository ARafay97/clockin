import { NextResponse } from "next/server";
import { requireManager } from "@/lib/require-manager";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { weekDates, timesheetCSV } from "@/lib/attendance";
import { rowToStaff, rowToSession } from "@/lib/attendance-db";

const SITE_ID = process.env.SITE_ID || "CAFE01";

export async function GET(request: Request) {
  const user = await requireManager();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const offset = Number(searchParams.get("offset")) || 0;
  const anchor = new Date();
  anchor.setDate(anchor.getDate() + offset * 7);
  const days = weekDates(anchor);

  const admin = createSupabaseAdminClient();
  const [{ data: staffRows }, { data: settingsRow }] = await Promise.all([
    admin.from("staff").select("*").eq("site_id", SITE_ID),
    admin.from("settings").select("round_step").eq("site_id", SITE_ID).single(),
  ]);
  const staffIds = (staffRows ?? []).map((s: { id: string }) => s.id);
  const { data: sessionRows } = await admin.from("sessions").select("*").in("date", days).in("staff_id", staffIds);

  const staff = (staffRows ?? []).map(rowToStaff);
  const sessions = (sessionRows ?? []).map(rowToSession);
  const csv = timesheetCSV({ staff, sessions, days, step: settingsRow?.round_step ?? 1, now: Date.now() });

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv",
      "content-disposition": `attachment; filename="timesheet_${days[0]}_to_${days[6]}.csv"`,
    },
  });
}
