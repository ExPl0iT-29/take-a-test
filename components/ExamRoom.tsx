"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Q = { id: string; type: "mcq_single" | "mcq_multi" | "long_text"; prompt: string; options: { id: string; text: string; image_url?: string | null }[] | null; points: number; image_url?: string | null };

const SNAPSHOT_INTERVAL_MS = 15000;
const MAX_VIOLATIONS = 3;

export default function ExamRoom({ test, questions, attempt }: { test: any; questions: Q[]; attempt: any }) {
  const supabase = createClient();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<"prep" | "active" | "submitted">("prep");
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [violations, setViolations] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState<number>(Date.now());
  const endAt = useRef<number>(new Date(attempt.started_at).getTime() + test.duration_minutes * 60_000);

  const logEvent = useCallback(async (kind: string, detail?: any) => {
    await supabase.from("proctor_events").insert({ attempt_id: attempt.id, kind, detail });
  }, [attempt.id, supabase]);

  const saveAnswer = useCallback(async (q: Q, response: any) => {
    setAnswers((a) => ({ ...a, [q.id]: response }));
    await supabase.from("answers").upsert(
      { attempt_id: attempt.id, question_id: q.id, response, updated_at: new Date().toISOString() },
      { onConflict: "attempt_id,question_id" }
    );
  }, [attempt.id, supabase]);

  const submit = useCallback(async (terminated = false) => {
    // All grading happens server-side; client never sees correct answers.
    await fetch(`/api/test/${test.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminated }),
    });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    setPhase("submitted");
    router.push("/dashboard");
    router.refresh();
  }, [answers, attempt.id, questions, router, supabase]);

  const addViolation = useCallback((kind: string, detail?: any) => {
    logEvent(kind, detail);
    setViolations((v) => {
      const next = v + 1;
      setBanner(`Violation (${next}/${MAX_VIOLATIONS}): ${kind}`);
      if (next >= MAX_VIOLATIONS) {
        logEvent("terminated", { reason: "max_violations" });
        submit(true);
      }
      return next;
    });
  }, [logEvent, submit]);

  // Start: request camera + fullscreen
  const startExam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
    } catch (e: any) {
      setBanner("Camera is required. Allow camera access and reload.");
      return;
    }
    try { await containerRef.current?.requestFullscreen(); }
    catch { setBanner("Fullscreen is required."); return; }
    setPhase("active");
    logEvent("exam_started");
  };

  // Wire proctoring listeners
  useEffect(() => {
    if (phase !== "active") return;

    const onFsChange = () => {
      if (!document.fullscreenElement) addViolation("fullscreen_exit");
    };
    const onVis = () => { if (document.hidden) addViolation("tab_blur"); };
    const onBlur = () => addViolation("window_blur");
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); addViolation("copy_blocked"); };
    const onPaste = (e: ClipboardEvent) => { e.preventDefault(); addViolation("paste_blocked"); };
    const onCut = (e: ClipboardEvent) => { e.preventDefault(); addViolation("cut_blocked"); };
    const onContext = (e: MouseEvent) => { e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      // Block common shortcuts
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "p", "s", "u"].includes(k)) { e.preventDefault(); addViolation("shortcut_blocked", { key: k }); }
      if (k === "printscreen") { e.preventDefault(); addViolation("printscreen_blocked"); }
      if (k === "f12") e.preventDefault();
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("cut", onCut);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("keydown", onKey);
    };
  }, [phase, addViolation]);

  // Webcam liveness check + periodic snapshots
  useEffect(() => {
    if (phase !== "active") return;
    const i = setInterval(async () => {
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (!track || track.readyState !== "live") { addViolation("camera_off"); return; }
      const canvas = document.createElement("canvas");
      const v = videoRef.current; if (!v) return;
      canvas.width = v.videoWidth || 320; canvas.height = v.videoHeight || 240;
      const ctx = canvas.getContext("2d"); if (!ctx) return;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.6));
      if (!blob) return;
      const path = `${attempt.id}/${Date.now()}.jpg`;
      const up = await supabase.storage.from("snapshots").upload(path, blob, { contentType: "image/jpeg" });
      if (!up.error) logEvent("snapshot", { path });
    }, SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(i);
  }, [phase, addViolation, attempt.id, logEvent, supabase]);

  // Timer
  useEffect(() => {
    if (phase !== "active") return;
    const i = setInterval(() => {
      const t = Date.now(); setNow(t);
      if (t >= endAt.current) { clearInterval(i); submit(false); }
    }, 1000);
    return () => clearInterval(i);
  }, [phase, submit]);

  if (phase === "prep") {
    return (
      <main className="max-w-2xl mx-auto p-10" ref={containerRef}>
        <h1 className="text-2xl font-bold">{test.title}</h1>
        <p className="text-slate-600 mt-2">{test.description}</p>
        <div className="card mt-6 space-y-2 text-sm">
          <p><b>Before you start:</b></p>
          <ul className="list-disc pl-5 space-y-1">
            <li>The test will run in <b>fullscreen</b> — exiting counts as a violation.</li>
            <li>Your <b>webcam must be on</b>; snapshots are captured periodically.</li>
            <li><b>Copy, paste, and right-click are disabled.</b></li>
            <li>Switching tabs or windows is logged as a violation.</li>
            <li>After {MAX_VIOLATIONS} violations, the test is auto-submitted.</li>
            <li>Duration: <b>{test.duration_minutes} minutes</b>.</li>
          </ul>
        </div>
        {banner && <p className="text-red-600 text-sm mt-4">{banner}</p>}
        <button className="btn mt-6" onClick={startExam}>Start exam</button>
      </main>
    );
  }

  const q = questions[idx];
  const remaining = Math.max(0, Math.floor((endAt.current - now) / 1000));
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50 select-none" onCopy={(e) => e.preventDefault()} onPaste={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}>
      {banner && <div className="bg-red-600 text-white text-center py-2 text-sm">{banner}</div>}
      <header className="flex items-center justify-between p-4 border-b bg-white">
        <div><b>{test.title}</b> <span className="text-slate-500 text-sm">· Q{idx + 1}/{questions.length}</span></div>
        <div className="flex items-center gap-4">
          <video ref={videoRef} className="w-24 h-16 bg-black rounded" muted playsInline />
          <div className="font-mono text-lg">{mm}:{ss}</div>
          <button className="btn" onClick={() => submit(false)}>Submit</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6">
        {q && (
          <div className="card">
            <div className="text-sm text-slate-500">{q.type} · {q.points} pts</div>
            <h2 className="text-lg font-semibold mt-1 whitespace-pre-wrap">{q.prompt}</h2>
            {q.image_url && <img src={q.image_url} alt="" className="mt-3 max-h-80 rounded border" onContextMenu={(e) => e.preventDefault()} draggable={false} />}
            <div className="mt-4 space-y-2">
              {q.type === "long_text" && (
                <textarea
                  className="input min-h-[200px] font-mono"
                  value={answers[q.id]?.text || ""}
                  onPaste={(e) => e.preventDefault()}
                  onChange={(e) => saveAnswer(q, { text: e.target.value })}
                />
              )}
              {q.type !== "long_text" && q.options?.map((opt) => {
                const sel: string[] = answers[q.id]?.selected || [];
                const checked = sel.includes(opt.id);
                return (
                  <label key={opt.id} className={`flex gap-2 items-center p-2 rounded border ${checked ? "border-slate-900 bg-slate-100" : "border-slate-200"}`}>
                    <input
                      type={q.type === "mcq_single" ? "radio" : "checkbox"}
                      name={`q-${q.id}`}
                      checked={checked}
                      onChange={(e) => {
                        let next = sel.slice();
                        if (q.type === "mcq_single") next = e.target.checked ? [opt.id] : [];
                        else next = e.target.checked ? [...next, opt.id] : next.filter((x) => x !== opt.id);
                        saveAnswer(q, { selected: next });
                      }}
                    />
                    <div className="flex-1">
                      <div>{opt.text}</div>
                      {opt.image_url && <img src={opt.image_url} alt="" className="mt-1 max-h-32 rounded border" onContextMenu={(e) => e.preventDefault()} draggable={false} />}
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="mt-6 flex justify-between">
              <button className="btn-secondary" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>← Previous</button>
              {idx < questions.length - 1 ? (
                <button className="btn" onClick={() => setIdx((i) => i + 1)}>Next →</button>
              ) : (
                <button className="btn" onClick={() => submit(false)}>Finish & submit</button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
