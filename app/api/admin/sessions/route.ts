import { NextResponse } from "next/server";
import { requireManager } from "@/lib/require-manager";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { atOn, parseHM, MIN } from "@/lib/attendance";

interface SessionBody {
  id: string;
  inTime: string; // "HH:MM"
  outTime?: string | null; // "HH:MM", or empty to leave the session open
  deleted?: boolean;
}

export async function POST(request: Request) {
  const user = await requireManager();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as SessionBody;
  const admin = createSupabaseAdminClient();

  if (body.deleted) {
    const { error } = await admin.from("sessions").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { data: existing, error: fetchError } = await admin
    .from("sessions")
    .select("date, out_flag")
    .eq("id", body.id)
    .single();
  if (fetchError || !existing) return NextResponse.json({ error: "session not found" }, { status: 404 });

  const inAt = atOn(existing.date, parseHM(body.inTime));
  let outAt: number | null = null;
  if (body.outTime) {
    outAt = atOn(existing.date, parseHM(body.outTime));
    if (outAt <= inAt) outAt += 24 * 60 * MIN; // crossed midnight
  }

  const { error } = await admin
    .from("sessions")
    .update({
      in_at: new Date(inAt).toISOString(),
      out_at: outAt ? new Date(outAt).toISOString() : null,
      out_flag: outAt ? existing.out_flag || "unscheduled" : null,
      edited_by: user.email || user.id,
    })
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
