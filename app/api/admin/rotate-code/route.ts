import { NextResponse } from "next/server";
import { requireManager } from "@/lib/require-manager";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SITE_ID = process.env.SITE_ID || "CAFE01";

/** Bumps settings.token_epoch, immediately invalidating the current printed code. */
export async function POST() {
  const user = await requireManager();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: current, error: fetchError } = await admin
    .from("settings")
    .select("token_epoch")
    .eq("site_id", SITE_ID)
    .single();
  if (fetchError || !current) {
    return NextResponse.json({ error: "site not configured" }, { status: 500 });
  }

  const nextEpoch = (current.token_epoch ?? 1) + 1;
  const { error } = await admin.from("settings").update({ token_epoch: nextEpoch }).eq("site_id", SITE_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, epoch: nextEpoch });
}
