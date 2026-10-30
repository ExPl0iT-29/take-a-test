import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

const COOKIE_PREFIX = "tat_session_";

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Single-session enforcement. The browser no longer upserts answers
 * directly (see ExamRoom.tsx) — every save goes through here so the
 * server can bind the attempt to one device via an httpOnly cookie:
 *
 * - First save for an attempt: generate a token, store it + the current
 *   user-agent/IP on the attempt, set the cookie.
 * - Same cookie token on later saves: compare user-agent (mismatch =
 *   counted infringement, e.g. a copied session cookie opened in another
 *   browser) and IP (mismatch = logged only, networks legitimately
 *   change IP mid-exam) against what was stored.
 * - Missing or different cookie token entirely: a second device trying
 *   to use the same account. Locks the attempt — further saves are
 *   rejected until an admin clears it (session_locked) for this attempt.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { question_id, response } = await req.json().catch(() => ({}));
  if (!question_id) return NextResponse.json({ error: "question_id required" }, { status: 400 });

  const db = adminClient();
  const { data: attempt } = await db
    .from("attempts").select("id, status, session_token, session_ua, session_ip, session_locked")
    .eq("test_id", id).eq("candidate_id", user.id).maybeSingle();
  if (!attempt) return NextResponse.json({ error: "No attempt" }, { status: 404 });
  if (attempt.status !== "in_progress") return NextResponse.json({ error: "Attempt not in progress" }, { status: 400 });
  if (attempt.session_locked) {
    return NextResponse.json({ error: "This session is locked. Ask your supervisor to allow resuming." }, { status: 423 });
  }

  const cookieName = `${COOKIE_PREFIX}${attempt.id}`;
  const cookieToken = req.cookies.get(cookieName)?.value || null;
  const ua = req.headers.get("user-agent") || "unknown";
  const ip = clientIp(req);

  let setCookie: string | null = null;
  let violation: string | null = null;

  if (!attempt.session_token) {
    // First write for this attempt: bind it to this device.
    const token = crypto.randomUUID();
    await db.from("attempts").update({ session_token: token, session_ua: ua, session_ip: ip }).eq("id", attempt.id);
    setCookie = token;
  } else if (cookieToken !== attempt.session_token) {
    // No cookie at all, or a different one — a second device.
    await db.from("attempts").update({ session_locked: true }).eq("id", attempt.id);
    await db.from("proctor_events").insert({
      attempt_id: attempt.id, kind: "session_conflict",
      detail: { reason: cookieToken ? "token_mismatch" : "no_cookie", ua, ip },
    });
    return NextResponse.json({ error: "This session is locked. Ask your supervisor to allow resuming." }, { status: 423 });
  } else {
    if (ua !== attempt.session_ua) {
      await db.from("proctor_events").insert({ attempt_id: attempt.id, kind: "browser_changed", detail: { from: attempt.session_ua, to: ua } });
      violation = "browser_changed";
    }
    if (ip !== attempt.session_ip) {
      await db.from("proctor_events").insert({ attempt_id: attempt.id, kind: "ip_changed", detail: { from: attempt.session_ip, to: ip } });
      // IP changes are reported, not counted as a violation — networks
      // legitimately roam mid-exam (wifi handoff, carrier NAT, etc).
    }
  }

  await db.from("answers").upsert(
    { attempt_id: attempt.id, question_id, response, updated_at: new Date().toISOString() },
    { onConflict: "attempt_id,question_id" }
  );

  const res = NextResponse.json({ ok: true, violation });
  if (setCookie) {
    res.cookies.set(cookieName, setCookie, {
      httpOnly: true, sameSite: "strict", secure: true, path: `/`, maxAge: 60 * 60 * 6,
    });
  }
  return res;
}
