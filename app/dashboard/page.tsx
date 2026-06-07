import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Dashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (profile?.role === "admin") redirect("/admin");

  const { data: allTests } = await supabase
    .from("tests").select("id, title, description, duration_minutes, invite_only")
    .eq("is_published", true).order("created_at", { ascending: false });
  // For invite_only tests, candidate must have an invite row matching their email
  const { data: myInvites } = await supabase
    .from("invites").select("test_id").ilike("email", user.email || "");
  const allowedTestIds = new Set((myInvites || []).map((i: any) => i.test_id));
  const tests = (allTests || []).filter((t: any) => !t.invite_only || allowedTestIds.has(t.id));
  const { data: attempts } = await supabase
    .from("attempts").select("id, test_id, status, score, submitted_at").eq("candidate_id", user.id);

  const attemptByTest = new Map((attempts || []).map((a) => [a.test_id, a]));

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Available tests</h1>
        <form action="/auth/signout" method="post"><button className="btn-secondary">Sign out</button></form>
      </div>
      <div className="mt-6 space-y-3">
        {(tests || []).length === 0 && <p className="text-slate-600">No published tests yet.</p>}
        {(tests || []).map((t) => {
          const a = attemptByTest.get(t.id);
          return (
            <div key={t.id} className="card flex items-center justify-between">
              <div>
                <div className="font-semibold">{t.title}</div>
                <div className="text-sm text-slate-600">{t.description}</div>
                <div className="text-xs text-slate-500 mt-1">Duration: {t.duration_minutes} min</div>
              </div>
              <div>
                {a?.status === "submitted" || a?.status === "terminated" ? (
                  <span className="text-sm text-slate-600">Completed</span>
                ) : (
                  <Link href={`/test/${t.id}`} className="btn">{a ? "Resume" : "Start"}</Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
