import { createBrowserClient } from "@supabase/ssr";

/** Anon-key client for the browser. Used only for the manager login form. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
