import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Attempts({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: attempts } = await supabase
    .from("attempts")
    .select("id, status, score, submitted_at, started_at, candidate:profiles(email, full_name)")
    .eq("test_id", id)
    .order("started_at", { ascending: false });

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <a href="/admin" className="text-sm text-slate-600">← Back</a>
      <h1 className="text-2xl font-bold mt-2">Attempts</h1>
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr><th className="py-2">Candidate</th><th>Status</th><th>Score</th><th>Started</th><th>Submitted</th><th></th></tr>
        </thead>
        <tbody>
          {(attempts || []).map((a: any) => (
            <tr key={a.id} className="border-t">
              <td className="py-2">{a.candidate?.full_name || a.candidate?.email}</td>
              <td>{a.status}</td>
              <td>{a.score ?? "-"}</td>
              <td>{a.started_at ? new Date(a.started_at).toLocaleString() : "-"}</td>
              <td>{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "-"}</td>
              <td><a className="underline" href={`/admin/attempts/${a.id}`}>View</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
