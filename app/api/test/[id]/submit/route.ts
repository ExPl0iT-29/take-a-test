import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Submits an attempt and triggers server-side grading via a SECURITY DEFINER
 * SQL function. The client never sees correct answers — they live in the
 * admin-only `answer_keys` table that only the function can read.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { terminated } = await req.json().catch(() => ({ terminated: false }));

  const { data: attempt } = await supabase
    .from("attempts").select("id, status").eq("test_id", params.id).eq("candidate_id", user.id).maybeSingle();
  if (!attempt) return NextResponse.json({ error: "No attempt" }, { status: 404 });
  if (attempt.status !== "in_progress") return NextResponse.json({ error: "Already submitted" }, { status: 400 });

  const { error } = await supabase.rpc("submit_attempt", { p_attempt_id: attempt.id, p_terminated: !!terminated });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
