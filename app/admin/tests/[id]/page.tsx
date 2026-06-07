"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type QType = "mcq_single" | "mcq_multi" | "long_text";
type Option = { id: string; text: string; image_url?: string | null };
type Question = {
  id?: string; test_id: string; position: number; type: QType;
  prompt: string; options: Option[] | null; correct: string[] | null;
  points: number; image_url?: string | null;
};

export default function EditTest() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [test, setTest] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState("");

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from("tests").select("*").eq("id", id).single();
      setTest(t);
      const { data: qs } = await supabase.from("questions").select("*").eq("test_id", id).order("position");
      const ids = (qs || []).map((q: any) => q.id);
      const { data: keys } = ids.length
        ? await supabase.from("answer_keys").select("question_id, correct").in("question_id", ids)
        : { data: [] as any[] };
      const keyMap = new Map((keys || []).map((k: any) => [k.question_id, k.correct]));
      const withKeys = (qs || []).map((q: any) => ({ ...q, correct: keyMap.get(q.id) || null }));
      setQuestions(withKeys);
      setLink(`${window.location.origin}/test/${id}`);
    })();
  }, [id, supabase]);

  const updateTest = async (patch: any) => {
    setTest({ ...test, ...patch });
    await supabase.from("tests").update(patch).eq("id", id);
  };

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 8; i++) { if (i === 4) out += "-"; out += chars[Math.floor(Math.random() * chars.length)]; }
    updateTest({ access_code: out });
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) { alert("Only PNG / JPG / GIF / WebP images allowed."); return null; }
    if (file.size > 5 * 1024 * 1024) { alert("Image too large (max 5 MB)."); return null; }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${id}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("question-images").upload(path, file, { contentType: file.type });
    if (up.error) { alert(up.error.message); return null; }
    const { data: pub } = supabase.storage.from("question-images").getPublicUrl(path);
    return pub.publicUrl;
  };

  const addQuestion = (type: QType) => {
    const isMcq = type !== "long_text";
    setQuestions((qs) => [...qs, {
      test_id: id, position: qs.length, type, prompt: "",
      options: isMcq ? [{ id: crypto.randomUUID(), text: "" }, { id: crypto.randomUUID(), text: "" }] : null,
      correct: isMcq ? [] : null, points: 1, image_url: null,
    }]);
  };

  const saveAll = async () => {
    setSaving(true);
    await supabase.from("questions").delete().eq("test_id", id);
    if (questions.length) {
      const rows = questions.map((q, i) => ({
        test_id: id, position: i, type: q.type, prompt: q.prompt,
        options: q.options, points: q.points,
        image_url: q.image_url ?? null,
      }));
      const { data: inserted } = await supabase.from("questions").insert(rows).select("id");
      // Re-attach answer keys (only for MCQ)
      const keyRows = (inserted || []).map((row: any, idx: number) => ({
        question_id: row.id, correct: questions[idx].correct ?? [],
      })).filter((_, idx) => questions[idx].type !== "long_text");
      if (keyRows.length) await supabase.from("answer_keys").upsert(keyRows);
    }
    setSaving(false);
  };

  if (!test) return <main className="p-10">Loading…</main>;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <a href="/admin" className="text-sm text-slate-600">← Back</a>
      <div className="flex items-center justify-between mt-2">
        <h1 className="text-2xl font-bold">Edit test</h1>
        <button
          className="text-sm text-red-600 underline"
          onClick={async () => {
            if (!confirm(`Delete "${test.title}"?\n\nThis will also delete all questions, attempts, answers, invites, and proctor events for this test. This cannot be undone.`)) return;
            const { error } = await supabase.from("tests").delete().eq("id", id);
            if (error) return alert(error.message);
            window.location.href = "/admin";
          }}
        >Delete test</button>
      </div>

      <div className="card mt-4 space-y-3">
        <input className="input" value={test.title} onChange={(e) => updateTest({ title: e.target.value })} />
        <textarea className="input" value={test.description || ""} onChange={(e) => updateTest({ description: e.target.value })} placeholder="Description" />
        <label className="block text-sm">Duration (minutes)
          <input className="input mt-1" type="number" min={1} value={test.duration_minutes} onChange={(e) => updateTest({ duration_minutes: parseInt(e.target.value) })} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={test.is_published} onChange={(e) => updateTest({ is_published: e.target.checked })} />
          Published (candidates can see it)
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={test.require_seb || false} onChange={(e) => updateTest({ require_seb: e.target.checked })} />
          Require Safe Exam Browser — block normal browsers from opening this test
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={test.invite_only || false} onChange={(e) => updateTest({ invite_only: e.target.checked })} />
          Invite-only — only emails on the Invites list can see or take this test
        </label>

        <div className="border-t pt-3">
          <div className="text-sm font-medium">Access code</div>
          <p className="text-xs text-slate-500 mt-1">Optional. If set, candidates must enter this code to start the test. Share it with invited candidates.</p>
          <div className="flex gap-2 mt-2">
            <input className="input font-mono" placeholder="(none)" value={test.access_code || ""}
              onChange={(e) => updateTest({ access_code: e.target.value.toUpperCase() || null })} />
            <button className="btn-secondary" onClick={generateCode} type="button">Generate</button>
            {test.access_code && <button className="btn-secondary" onClick={() => updateTest({ access_code: null })} type="button">Clear</button>}
          </div>
        </div>

        <div className="border-t pt-3">
          <a href={`/admin/tests/${id}/invites`} className="btn-secondary">Manage candidate invites →</a>
        </div>

        {test.is_published && (
          <div className="space-y-2 border-t pt-3">
            <div className="text-sm bg-slate-100 rounded p-2 break-all">
              Share link: <code>{link}</code>
              {test.access_code && <div className="text-xs text-slate-600 mt-1">Code: <code className="font-mono">{test.access_code}</code></div>}
            </div>
            <div className="text-sm bg-amber-50 border border-amber-200 rounded p-3">
              <b>Safe Exam Browser (recommended)</b>
              <p className="mt-1 text-slate-700">Opening this link launches SEB in lockdown mode (no alt-tab, no screen share, no clipboard).</p>
              <div className="mt-2"><a className="underline text-blue-700" href={`/api/seb/${id}`}>Download .seb config</a></div>
              <p className="mt-1 text-xs text-slate-500">Candidates need SEB installed: <a className="underline" href="https://safeexambrowser.org/download_en.html" target="_blank" rel="noreferrer">safeexambrowser.org</a></p>
            </div>
          </div>
        )}
      </div>

      <h2 className="font-semibold mt-8">Questions</h2>
      <div className="mt-2 flex gap-2">
        <button className="btn-secondary" onClick={() => addQuestion("mcq_single")}>+ MCQ (single)</button>
        <button className="btn-secondary" onClick={() => addQuestion("mcq_multi")}>+ MCQ (multi)</button>
        <button className="btn-secondary" onClick={() => addQuestion("long_text")}>+ Long answer</button>
      </div>

      <div className="mt-4 space-y-4">
        {questions.map((q, i) => (
          <div key={i} className="card space-y-2">
            <div className="flex justify-between items-center">
              <b>Q{i + 1} · {q.type}</b>
              <button className="text-red-600 text-sm" onClick={() => setQuestions((arr) => arr.filter((_, k) => k !== i))}>Remove</button>
            </div>
            <textarea className="input" placeholder="Question prompt" value={q.prompt} onChange={(e) => {
              const v = e.target.value; setQuestions((arr) => arr.map((x, k) => k === i ? { ...x, prompt: v } : x));
            }} />

            <div className="flex items-center gap-2 text-sm">
              <label className="btn-secondary cursor-pointer">
                {q.image_url ? "Change image" : "+ Image"}
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const url = await uploadImage(f);
                  if (url) setQuestions((arr) => arr.map((x, k) => k === i ? { ...x, image_url: url } : x));
                }} />
              </label>
              {q.image_url && (
                <>
                  <a className="text-xs underline" href={q.image_url} target="_blank" rel="noreferrer">view</a>
                  <button className="text-xs text-red-600" onClick={() => setQuestions((arr) => arr.map((x, k) => k === i ? { ...x, image_url: null } : x))}>remove</button>
                </>
              )}
            </div>
            {q.image_url && <img src={q.image_url} alt="" className="max-h-40 rounded border mt-1" />}

            <label className="text-sm block">Points
              <input className="input mt-1" type="number" min={0} value={q.points} onChange={(e) => {
                const v = parseInt(e.target.value); setQuestions((arr) => arr.map((x, k) => k === i ? { ...x, points: v } : x));
              }} />
            </label>

            {q.type !== "long_text" && q.options && (
              <div className="space-y-2">
                {q.options.map((opt, j) => (
                  <div key={opt.id} className="space-y-1">
                    <div className="flex gap-2 items-center">
                      <input
                        type={q.type === "mcq_single" ? "radio" : "checkbox"}
                        name={`correct-${i}`}
                        checked={q.correct?.includes(opt.id) || false}
                        onChange={(e) => {
                          setQuestions((arr) => arr.map((x, k) => {
                            if (k !== i) return x;
                            let cur = x.correct || [];
                            if (q.type === "mcq_single") cur = e.target.checked ? [opt.id] : [];
                            else cur = e.target.checked ? [...cur, opt.id] : cur.filter((c) => c !== opt.id);
                            return { ...x, correct: cur };
                          }));
                        }}
                      />
                      <input className="input flex-1" placeholder={`Option ${j + 1}`} value={opt.text} onChange={(e) => {
                        const v = e.target.value;
                        setQuestions((arr) => arr.map((x, k) => k === i ? { ...x, options: x.options!.map((o) => o.id === opt.id ? { ...o, text: v } : o) } : x));
                      }} />
                      <label className="btn-secondary text-xs cursor-pointer">
                        {opt.image_url ? "img ✓" : "img"}
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const f = e.target.files?.[0]; if (!f) return;
                          const url = await uploadImage(f);
                          if (url) setQuestions((arr) => arr.map((x, k) => k === i ? { ...x, options: x.options!.map((o) => o.id === opt.id ? { ...o, image_url: url } : o) } : x));
                        }} />
                      </label>
                      <button className="text-sm text-slate-500" onClick={() => setQuestions((arr) => arr.map((x, k) => k === i ? { ...x, options: x.options!.filter((o) => o.id !== opt.id), correct: (x.correct || []).filter((c) => c !== opt.id) } : x))}>×</button>
                    </div>
                    {opt.image_url && <img src={opt.image_url} alt="" className="max-h-24 rounded border ml-7" />}
                  </div>
                ))}
                <button className="btn-secondary text-xs" onClick={() => setQuestions((arr) => arr.map((x, k) => k === i ? { ...x, options: [...(x.options || []), { id: crypto.randomUUID(), text: "" }] } : x))}>+ Add option</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6">
        <button className="btn" onClick={saveAll} disabled={saving}>{saving ? "Saving…" : "Save questions"}</button>
      </div>
    </main>
  );
}
