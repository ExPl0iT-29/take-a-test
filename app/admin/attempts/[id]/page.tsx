import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Grader from "@/components/Grader";

export default async function AttemptDetail({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: a } = await supabase
    .from("attempts")
    .select("*, candidate:profiles(email, full_name), test:tests(title)")
    .eq("id", params.id).single();
  const { data: answers } = await supabase
    .from("answers").select("*, question:questions(*)").eq("attempt_id", params.id);
  const { data: events } = await supabase
    .from("proctor_events").select("*").eq("attempt_id", params.id).order("created_at");

  // Snapshot URLs (signed, 1h)
  const snapshotPaths: string[] = (events || [])
    .filter((e) => e.kind === "snapshot" && e.detail?.path)
    .map((e) => e.detail.path);
  const signedSnapshots: { path: string; url: string; ts: string }[] = [];
  if (snapshotPaths.length) {
    const { data: signed } = await supabase.storage.from("snapshots").createSignedUrls(snapshotPaths, 3600);
    (signed || []).forEach((s, idx) => {
      if (s.signedUrl) signedSnapshots.push({ path: snapshotPaths[idx], url: s.signedUrl, ts: (events || []).filter((e) => e.kind === "snapshot")[idx]?.created_at });
    });
  }

  const longAnswers = (answers || []).filter((x: any) => x.question?.type === "long_text");
  const mcqAnswers = (answers || []).filter((x: any) => x.question?.type !== "long_text");

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <a href="/admin" className="text-sm text-slate-600">← Back</a>
      <h1 className="text-2xl font-bold mt-2">Attempt · {a?.test?.title}</h1>
      <p className="text-slate-600">{a?.candidate?.full_name} · {a?.candidate?.email} · {a?.status} · <b>total score: {a?.score ?? "-"}</b></p>

      {longAnswers.length > 0 && (
        <>
          <h2 className="font-semibold mt-8">Grade long answers</h2>
          <div className="mt-2 space-y-3">
            {longAnswers.map((ans: any) => (
              <Grader
                key={ans.id} answerId={ans.id} question={ans.question}
                response={ans.response} initialScore={ans.score} initialFeedback={ans.feedback}
              />
            ))}
          </div>
        </>
      )}

      {mcqAnswers.length > 0 && (
        <>
          <h2 className="font-semibold mt-8">MCQ answers (auto-graded)</h2>
          <div className="mt-2 space-y-2">
            {mcqAnswers.map((ans: any) => (
              <div key={ans.id} className="card">
                <div className="text-xs text-slate-500">{ans.question?.type} · {ans.score ?? 0}/{ans.question?.points} pts</div>
                <div className="font-medium mt-1">{ans.question?.prompt}</div>
                <div className="text-sm text-slate-700 mt-1">
                  Selected: <code>{JSON.stringify(ans.response?.selected || [])}</code>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {signedSnapshots.length > 0 && (
        <>
          <h2 className="font-semibold mt-8">Webcam snapshots ({signedSnapshots.length})</h2>
          <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-2">
            {signedSnapshots.map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer" className="block">
                <img src={s.url} alt="" className="aspect-square object-cover rounded border" />
                <div className="text-[10px] text-slate-500 mt-0.5">{s.ts ? new Date(s.ts).toLocaleTimeString() : ""}</div>
              </a>
            ))}
          </div>
        </>
      )}

      <h2 className="font-semibold mt-8">Proctor events ({events?.length || 0})</h2>
      <ul className="mt-2 text-sm max-h-72 overflow-y-auto border rounded p-2 bg-white">
        {(events || []).map((e) => (
          <li key={e.id} className="border-b last:border-0 py-1">
            <code className="text-slate-500">{new Date(e.created_at).toLocaleTimeString()}</code> · <b className={e.kind.includes("blocked") || e.kind.includes("exit") || e.kind === "terminated" ? "text-red-600" : ""}>{e.kind}</b>
            {e.detail ? <span className="text-slate-500"> {JSON.stringify(e.detail)}</span> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
