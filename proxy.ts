import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed Middleware to Proxy (same mechanism, new file name).
 * This is the UX gate: it redirects an unauthenticated page load away from
 * /admin and short-circuits /api/admin/* with a 401. Each /api/admin/*
 * Route Handler also calls requireManager() itself -- that's the actual
 * security boundary, since this file isn't guaranteed to see every request
 * path in every deployment topology.
 */
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSupabaseSession(request);

  const { pathname } = request.nextUrl;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");

  if (!user && isAdminPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!user && isAdminApi) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
