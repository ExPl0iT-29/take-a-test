import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Clears a session lock set by /api/test/[id]/answer when a second
 * device/browser tried to use the same attempt. Also clears the stored
 * session token so the candidate's next answer save re-binds fresh to
 * whichever device they're on when they resume.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const db = adminClient();
  const { error } = await db.from("attempts")
    .update({ session_locked: false, session_token: null, session_ua: null, session_ip: null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("proctor_events").insert({ attempt_id: id, kind: "session_resumed", detail: { by: user.id } });
  return NextResponse.json({ ok: true });
}
