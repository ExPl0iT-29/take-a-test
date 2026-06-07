import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ExamRoom from "@/components/ExamRoom";
import { SEB_ENFORCEMENT_ENABLED, verifySebRequest } from "@/lib/seb";
import UnlockForm from "@/components/UnlockForm";

export default async function TakeTest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/test/${id}`);

  const { data: test } = await supabase.from("tests").select("*").eq("id", id).single();
  if (!test || !test.is_published) return <main className="p-10">Test not available.</main>;

  // Invite-only allowlist gate (checked BEFORE creating an attempt)
  if (test.invite_only) {
    const { data: inv } = await supabase
      .from("invites").select("id").eq("test_id", id).ilike("email", user.email || "").maybeSingle();
    if (!inv) {
      return (
        <main className="max-w-xl mx-auto p-10 text-center">
          <h1 className="text-2xl font-bold">You're not on the invite list</h1>
          <p className="text-slate-600 mt-3">
            This exam is restricted to invited candidates. The email on your account
            (<code>{user.email}</code>) isn't on the list.
          </p>
          <p className="text-slate-600 mt-2">
            If you were invited, sign out and sign back in with the exact email
            your administrator used.
          </p>
          <div className="mt-6"><a href="/dashboard" className="btn-secondary">Back to dashboard</a></div>
        </main>
      );
    }
  }

  // SEB gate (global flag OR per-test require_seb)
  const sebRequired = SEB_ENFORCEMENT_ENABLED || test.require_seb;
  if (sebRequired) {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") || "https";
    const fullUrl = `${proto}://${host}/test/${id}`;
    const hash = h.get("x-safeexambrowser-requesthash");
    const ok = SEB_ENFORCEMENT_ENABLED
      ? await verifySebRequest(fullUrl, hash)
      : !!hash; // per-test mode: presence-only check (BEK not configured)
    if (!ok) {
      return (
        <main className="max-w-xl mx-auto p-10 text-center">
          <h1 className="text-2xl font-bold">Open this test in Safe Exam Browser</h1>
          <p className="text-slate-600 mt-3">
            This exam is locked to Safe Exam Browser (SEB). Install SEB, then open
            the <code className="mx-1 px-1 bg-slate-100 rounded">.seb</code> config file
            your administrator sent you. SEB will load this page automatically.
          </p>
          <div className="mt-6 flex gap-3 justify-center">
            <Link href="https://safeexambrowser.org/download_en.html" className="btn" target="_blank">Download SEB</Link>
            <Link href={`/api/seb/${id}`} className="btn-secondary">Get .seb config</Link>
          </div>
        </main>
      );
    }
  }

  const { data: questions } = await supabase
    .from("questions").select("id, type, prompt, options, points, position, image_url")
    .eq("test_id", id).order("position");

  let { data: attempt } = await supabase
    .from("attempts").select("*").eq("test_id", id).eq("candidate_id", user.id).maybeSingle();
  if (!attempt) {
    const { data: created } = await supabase
      .from("attempts").insert({ test_id: id, candidate_id: user.id }).select().single();
    attempt = created;
  }
  if (!attempt) return <main className="p-10">Could not start attempt.</main>;
  if (attempt.status !== "in_progress") {
    return (
      <main className="max-w-xl mx-auto p-10 text-center">
        <h1 className="text-2xl font-bold">Test submitted</h1>
        <p className="text-slate-600 mt-2">Your response has been recorded. Results will be shared by your administrator.</p>
        <a href="/dashboard" className="btn mt-6 inline-flex">Back</a>
      </main>
    );
  }

  // Access-code gate: required if test has a global code OR this candidate has a pending invite
  const { data: invite } = await supabase
    .from("invites").select("id, used_at")
    .eq("test_id", id).ilike("email", user.email || "").maybeSingle();
  const codeRequired = !!test.access_code || (!!invite && !invite.used_at);
  if (codeRequired && !attempt.unlocked) {
    return (
      <main className="max-w-md mx-auto p-10">
        <h1 className="text-2xl font-bold">{test.title}</h1>
        <p className="text-slate-600 mt-2">Enter the access code your administrator sent you to start.</p>
        <UnlockForm testId={id} />
      </main>
    );
  }

  return <ExamRoom test={test} questions={questions || []} attempt={attempt} />;
}
