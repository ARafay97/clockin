import { NextResponse } from "next/server";
import { requireManager } from "@/lib/require-manager";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

interface ShiftBody {
  id?: string;
  isNew?: boolean;
  deleted?: boolean;
  staffId: string;
  date: string;
  start: string;
  end: string;
}

export async function POST(request: Request) {
  const user = await requireManager();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as ShiftBody;
  const admin = createSupabaseAdminClient();

  if (body.deleted) {
    if (!body.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
    const { error } = await admin.from("shifts").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const row = {
    staff_id: body.staffId,
    date: body.date,
    start_time: body.start,
    end_time: body.end,
  };

  if (body.id && !body.isNew) {
    const { error } = await admin.from("shifts").update(row).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin.from("shifts").insert(row);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
