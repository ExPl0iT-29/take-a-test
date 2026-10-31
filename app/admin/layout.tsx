import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin MFA gate. Individual admin pages still check role themselves
 * (defense in depth), but this is the one place that checks aal — the
 * database-level enforcement (is_admin() in schema.sql) requires it too,
 * so an admin who hasn't enrolled TOTP would otherwise hit confusing RLS
 * failures deep in a page instead of a clear "go enroll" redirect here.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect("/mfa?next=/admin");

  return <>{children}</>;
}
