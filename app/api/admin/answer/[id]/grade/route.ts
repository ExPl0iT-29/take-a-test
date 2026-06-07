import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { score, feedback } = await req.json();
  const s = score === null || score === undefined || score === "" ? null : Number(score);
  if (s !== null && (Number.isNaN(s) || s < 0)) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }

  const { data: ans, error } = await supabase
    .from("answers")
    .update({ score: s, feedback: feedback ?? null })
    .eq("id", params.id)
    .select("attempt_id")
    .single();
  if (error || !ans) return NextResponse.json({ error: error?.message || "Update failed" }, { status: 400 });

  // Recompute attempt total
  const { data: rows } = await supabase.from("answers").select("score").eq("attempt_id", ans.attempt_id);
  const total = (rows || []).reduce((sum: number, r: any) => sum + Number(r.score || 0), 0);
  await supabase.from("attempts").update({ score: total }).eq("id", ans.attempt_id);

  return NextResponse.json({ ok: true, attempt_total: total });
}
