import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The signed-in manager, or null. Every /api/admin/* route checks this itself
 *  rather than relying solely on proxy.ts, since proxy.ts is a UX redirect,
 *  not the security boundary. */
export async function requireManager() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
