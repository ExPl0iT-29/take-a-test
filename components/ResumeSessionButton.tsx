"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResumeSessionButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const resume = async () => {
    if (!confirm("Allow this candidate to resume the exam on their current device?")) return;
    setBusy(true);
    const r = await fetch(`/api/admin/attempts/${attemptId}/resume`, { method: "POST" });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return alert(j.error || "Failed to resume");
    }
    router.refresh();
  };

  return (
    <button className="btn" disabled={busy} onClick={resume}>
      {busy ? "Resuming…" : "Allow resume"}
    </button>
  );
}
