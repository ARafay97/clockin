import { NextResponse } from "next/server";
import { requireManager } from "@/lib/require-manager";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SITE_ID = process.env.SITE_ID || "CAFE01";
const EDITABLE_FIELDS = ["cafe_name", "grace_min", "round_step", "cooldown_sec", "timezone"] as const;

export async function GET() {
  const user = await requireManager();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("settings").select("*").eq("site_id", SITE_ID).single();
  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const user = await requireManager();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in body) row[key] = body[key];
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("settings").update(row).eq("site_id", SITE_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
