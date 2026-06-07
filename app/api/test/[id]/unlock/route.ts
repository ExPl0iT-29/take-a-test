import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Allow up to N failed unlock attempts per (user, test) inside WINDOW_MS.
// Logged via proctor_events for audit.
const MAX_FAILED = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { code: raw } = await req.json().catch(() => ({ code: "" }));
  const code = String(raw || "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  const { data: test } = await supabase.from("tests").select("id, access_code, is_published, invite_only").eq("id", params.id).single();
  if (!test || !test.is_published) return NextResponse.json({ error: "Test not found" }, { status: 404 });

  // Ensure attempt exists so we can attach proctor events
  let { data: attempt } = await supabase
    .from("attempts").select("id, status").eq("test_id", params.id).eq("candidate_id", user.id).maybeSingle();
  if (!attempt) {
    const { data: created } = await supabase
      .from("attempts").insert({ test_id: params.id, candidate_id: user.id }).select().single();
    attempt = created;
  }
  if (!attempt) return NextResponse.json({ error: "Could not start attempt" }, { status: 500 });
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: `Test already ${attempt.status}` }, { status: 400 });
  }

  // Rate limit: count failed unlocks in window
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("proctor_events")
    .select("id", { count: "exact", head: true })
    .eq("attempt_id", attempt.id)
    .eq("kind", "unlock_failed")
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_FAILED) {
    return NextResponse.json({ error: "Too many failed attempts. Try again later." }, { status: 429 });
  }

  // Invite-only tests reject the global code; only personal invite codes count.
  const globalMatch = !test.invite_only && test.access_code && test.access_code.trim().toUpperCase() === code;

  let inviteId: string | null = null;
  if (!globalMatch) {
    const { data: invite } = await supabase
      .from("invites")
      .select("id, code, email, used_at, used_by")
      .eq("test_id", params.id)
      .ilike("email", user.email || "")
      .maybeSingle();
    if (!invite || invite.code.trim().toUpperCase() !== code) {
      await supabase.from("proctor_events").insert({ attempt_id: attempt.id, kind: "unlock_failed" });
      return NextResponse.json({ error: "Wrong code" }, { status: 403 });
    }
    if (invite.used_at && invite.used_by !== user.id) {
      await supabase.from("proctor_events").insert({ attempt_id: attempt.id, kind: "unlock_failed", detail: { reason: "already_used" } });
      return NextResponse.json({ error: "Code already used" }, { status: 403 });
    }
    inviteId = invite.id;
  }

  await supabase.from("attempts").update({ unlocked: true }).eq("id", attempt.id);
  if (inviteId) {
    await supabase.from("invites").update({ used_at: new Date().toISOString(), used_by: user.id }).eq("id", inviteId);
  }
  await supabase.from("proctor_events").insert({ attempt_id: attempt.id, kind: "unlock_success" });
  return NextResponse.json({ ok: true });
}
