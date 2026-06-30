import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Middleware exists only to refresh the Supabase auth cookie on each request.
// Page-level redirects are handled in the page components themselves so that
// a transient Supabase outage doesn't bounce signed-in users to /login.
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: { name: string; value: string; options?: any }[]) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );
  // ponytail: best-effort token refresh. Errors are non-fatal — the page will
  // call getUser() itself and redirect to /login if there's genuinely no session.
  try { await supabase.auth.getUser(); } catch { /* network blip, ignore */ }
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/test/:path*"],
};
