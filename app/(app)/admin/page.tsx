import { redirect } from "next/navigation";
import { requireManager } from "@/lib/require-manager";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { weekDates } from "@/lib/attendance";
import { rowToStaff, rowToSession } from "@/lib/attendance-db";
import { AdminClient } from "./AdminClient";

const SITE_ID = process.env.SITE_ID || "CAFE01";

export default async function AdminPage() {
  const user = await requireManager();
  if (!user) redirect("/login?next=/admin");

  const admin = createSupabaseAdminClient();
  const days = weekDates(new Date());

  const [{ data: staffRows }, { data: settingsRow }] = await Promise.all([
    admin.from("staff").select("*").eq("site_id", SITE_ID).order("name"),
    admin.from("settings").select("*").eq("site_id", SITE_ID).single(),
  ]);

  const staffIds = (staffRows ?? []).map((s: { id: string }) => s.id);
  const { data: sessionRows } = await admin
    .from("sessions")
    .select("*")
    .in("date", days)
    .in("staff_id", staffIds)
    .order("in_at", { ascending: false });

  const staff = (staffRows ?? []).map(rowToStaff);
  const sessions = (sessionRows ?? []).map(rowToSession);

  // Server Component render, once per request -- the server's clock, not a
  // client re-render hazard.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return <AdminClient staff={staff} sessions={sessions} settings={settingsRow} userEmail={user.email ?? ""} now={now} />;
}
