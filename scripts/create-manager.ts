/**
 * Creates (or updates the password of) the one Supabase Auth account that
 * signs in at /login and unlocks /admin and roster editing. Run with:
 *   npx tsx scripts/create-manager.ts <email> <password>
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

import { createSupabaseAdminClient } from "../lib/supabase/admin";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npx tsx scripts/create-manager.ts <email> <password>");
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`"${email}" doesn't look like a valid email address. Supabase Auth requires a real email format (e.g. manager@yourcafe.com).`);
    process.exit(1);
  }

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === email);

  if (found) {
    const { error } = await admin.auth.admin.updateUserById(found.id, { password });
    if (error) throw error;
    console.log(`Updated password for existing manager account: ${email}`);
    return;
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`Created manager account: ${email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
