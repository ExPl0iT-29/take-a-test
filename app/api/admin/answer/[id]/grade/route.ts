import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { score, feedback } = await req.json();
  const s = score === null || score === undefined || score === "" ? null : Number(score);
  if (s !== null && (Number.isNaN(s) || s < 0)) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }

  // score/feedback are staff-only columns — candidates can insert/update
  // their own `response` but never these, enforced by column grants in
  // schema.sql. Writing them (and the attempt total below) requires the
  // service-role client.
  const db = adminClient();
  const { data: ans, error } = await db
    .from("answers")
    .update({ score: s, feedback: feedback ?? null })
    .eq("id", id)
    .select("attempt_id")
    .single();
  if (error || !ans) return NextResponse.json({ error: error?.message || "Update failed" }, { status: 400 });

  // Recompute attempt total
  const { data: rows } = await db.from("answers").select("score").eq("attempt_id", ans.attempt_id);
  const total = (rows || []).reduce((sum: number, r: any) => sum + Number(r.score || 0), 0);
  await db.from("attempts").update({ score: total }).eq("id", ans.attempt_id);

  return NextResponse.json({ ok: true, attempt_total: total });
}
