import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireManager } from "@/lib/require-manager";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const SITE_ID = process.env.SITE_ID || "CAFE01";
const BCRYPT_COST = 10;

interface StaffBody {
  id?: string;
  isNew?: boolean;
  deleted?: boolean;
  name: string;
  role: string;
  pin?: string;
  active: boolean;
}

export async function POST(request: Request) {
  const user = await requireManager();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json()) as StaffBody;
  const admin = createSupabaseAdminClient();

  if (body.deleted) {
    if (!body.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
    const { error } = await admin.from("staff").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const isCreate = body.isNew || !body.id;
  if (isCreate && !/^\d{4}$/.test(body.pin || "")) {
    return NextResponse.json({ error: "a 4-digit PIN is required for a new staff member" }, { status: 400 });
  }
  if (body.pin && !/^\d{4}$/.test(body.pin)) {
    return NextResponse.json({ error: "PIN must be 4 digits" }, { status: 400 });
  }

  // PINs are hashed, so uniqueness can't be enforced with a DB constraint --
  // check it here by comparing against every other staff member's hash.
  if (body.pin) {
    const { data: others } = await admin.from("staff").select("id, pin_hash").eq("site_id", SITE_ID);
    for (const other of others ?? []) {
      if (other.id === body.id) continue;
      if (await bcrypt.compare(body.pin, other.pin_hash)) {
        return NextResponse.json({ error: "Another staff member already uses that PIN." }, { status: 409 });
      }
    }
  }

  if (isCreate) {
    const { error } = await admin.from("staff").insert({
      site_id: SITE_ID,
      name: body.name.trim(),
      role: body.role || "Barista",
      pin_hash: bcrypt.hashSync(body.pin as string, BCRYPT_COST),
      active: body.active !== false,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const row: Record<string, unknown> = {
    name: body.name.trim(),
    role: body.role || "Barista",
    active: body.active !== false,
  };
  if (body.pin) row.pin_hash = bcrypt.hashSync(body.pin, BCRYPT_COST);

  const { error } = await admin.from("staff").update(row).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
