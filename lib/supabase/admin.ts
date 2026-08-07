import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS by design -- only import this from
 * trusted server code (Route Handlers, Server Components, the seed script).
 * Never import from a Client Component: SUPABASE_SERVICE_ROLE_KEY has no
 * NEXT_PUBLIC_ prefix, so Next.js won't inline it into a client bundle, but
 * don't rely on that as the only safeguard.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service-role client is not configured (missing env vars)");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
