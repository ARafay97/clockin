/**
 * Local dev seed: wipes and recreates 5 staff (with known PINs) and a week
 * of shifts for the current site. Run with `npm run seed`. Not for
 * production use -- it deletes existing staff/shifts/sessions for the site
 * first so it can be re-run safely while developing.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawVal] = match;
    if (process.env[key] !== undefined) continue;
    let val = rawVal.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadEnvLocal();

import bcrypt from "bcryptjs";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { weekDates } from "../lib/attendance";

const SITE_ID = process.env.SITE_ID || "CAFE01";

const STAFF = [
  { name: "Amina Yusuf", role: "Supervisor", pin: "1234" },
  { name: "Joe Brennan", role: "Barista", pin: "2345" },
  { name: "Priya Shah", role: "Barista", pin: "3456" },
  { name: "Marek Nowak", role: "Barista", pin: "4567" },
  { name: "Chloe Adams", role: "Barista", pin: "5678" },
];

const PATTERNS: [string, string][] = [
  ["07:00", "15:00"],
  ["08:00", "16:00"],
  ["10:00", "18:00"],
  ["12:00", "20:00"],
  ["07:30", "13:30"],
];

async function main() {
  const admin = createSupabaseAdminClient();

  console.log(`Clearing existing data for site ${SITE_ID}...`);
  const { data: existingStaff } = await admin.from("staff").select("id").eq("site_id", SITE_ID);
  const existingIds = (existingStaff ?? []).map((s) => s.id);
  if (existingIds.length) {
    await admin.from("sessions").delete().in("staff_id", existingIds);
    await admin.from("shifts").delete().in("staff_id", existingIds);
    await admin.from("staff").delete().in("id", existingIds);
  }

  console.log("Seeding staff...");
  const staffIds: string[] = [];
  for (const person of STAFF) {
    const { data, error } = await admin
      .from("staff")
      .insert({
        site_id: SITE_ID,
        name: person.name,
        role: person.role,
        pin_hash: bcrypt.hashSync(person.pin, 10),
        active: true,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`Failed to insert ${person.name}: ${error?.message}`);
    staffIds.push(data.id as string);
    console.log(`  ${person.name} -- PIN ${person.pin}`);
  }

  console.log("Seeding a week of shifts...");
  const days = weekDates(new Date());
  const shiftRows: { staff_id: string; date: string; start_time: string; end_time: string }[] = [];
  days.forEach((date, di) => {
    STAFF.forEach((_person, pi) => {
      if ((pi + di) % 4 === 3) return; // everyone gets a day off in rotation
      const [start, end] = PATTERNS[(pi + di) % PATTERNS.length];
      shiftRows.push({ staff_id: staffIds[pi], date, start_time: start, end_time: end });
    });
  });
  const { error: shiftError } = await admin.from("shifts").insert(shiftRows);
  if (shiftError) throw new Error(`Failed to insert shifts: ${shiftError.message}`);

  console.log(`Done. ${staffIds.length} staff, ${shiftRows.length} shifts for ${days[0]} to ${days[6]}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
