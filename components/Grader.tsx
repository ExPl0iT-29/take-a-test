"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Q = { id: string; prompt: string; points: number; type: string; image_url?: string | null };

export default function Grader({
  answerId, question, response, initialScore, initialFeedback,
}: {
  answerId: string;
  question: Q;
  response: any;
  initialScore: number | null;
  initialFeedback: string | null;
}) {
  const router = useRouter();
  const [score, setScore] = useState<string>(initialScore == null ? "" : String(initialScore));
  const [feedback, setFeedback] = useState(initialFeedback || "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    const r = await fetch(`/api/admin/answer/${answerId}/grade`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: score === "" ? null : Number(score), feedback }),
    });
    setSaving(false);
    if (!r.ok) { const j = await r.json().catch(() => ({})); return alert(j.error || "Save failed"); }
    const j = await r.json();
    setSavedAt(new Date().toLocaleTimeString());
    router.refresh();
    void j; // consume
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-xs text-slate-500">{question.type} · max {question.points} pts</div>
          <div className="font-medium mt-1 whitespace-pre-wrap">{question.prompt}</div>
          {question.image_url && <img src={question.image_url} alt="" className="mt-2 max-h-40 rounded border" />}
        </div>
      </div>
      <div className="mt-3 text-sm text-slate-700 bg-slate-50 border rounded p-3 whitespace-pre-wrap font-mono">
        {response?.text || <span className="text-slate-400">(no response)</span>}
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <label className="text-sm">Score
          <input className="input mt-1 w-24" type="number" min={0} max={question.points} step="0.5"
            value={score} onChange={(e) => setScore(e.target.value)} placeholder="—" />
        </label>
        <input className="input flex-1 min-w-[200px]" placeholder="Feedback (optional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save grade"}</button>
        {savedAt && <span className="text-xs text-green-700">saved at {savedAt}</span>}
      </div>
    </div>
  );
}
