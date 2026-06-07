import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service role key.
 * NEVER import this from a "use client" file or expose it to the browser.
 */
export const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
