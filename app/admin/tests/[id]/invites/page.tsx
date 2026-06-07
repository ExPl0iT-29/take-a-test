"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { genCode } from "@/lib/code";

type Invite = {
  id: string; test_id: string; email: string; code: string;
  used_at: string | null; created_at: string;
};

export default function InvitesPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [test, setTest] = useState<any>(null);
  const [origin, setOrigin] = useState("");

  const load = async () => {
    const { data } = await supabase.from("invites").select("*").eq("test_id", id).order("created_at", { ascending: false });
    setInvites((data as any) || []);
  };

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      const { data: t } = await supabase.from("tests").select("*").eq("id", id).single();
      setTest(t);
      load();
    })();
  }, [id]);

  const addBatch = async () => {
    const list = Array.from(new Set(
      emails.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => /.+@.+\..+/.test(s))
    ));
    if (!list.length) return alert("No valid emails found");
    setBusy(true);
    const rows = list.map((email) => ({ test_id: id, email, code: genCode() }));
    const { error } = await supabase.from("invites").insert(rows);
    setBusy(false);
    if (error) return alert(error.message);
    setEmails("");
    load();
  };

  const remove = async (inviteId: string) => {
    await supabase.from("invites").delete().eq("id", inviteId);
    load();
  };

  const copyAll = () => {
    const text = invites.map((i) => `${i.email}\t${i.code}\t${origin}/test/${id}`).join("\n");
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard (email \\t code \\t link)");
  };

  const exportCsv = () => {
    const csv = "email,code,link\n" + invites.map((i) => `${i.email},${i.code},${origin}/test/${id}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `invites-${id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const mailtoLink = (i: Invite) => {
    const link = `${origin}/test/${id}`;
    const subject = encodeURIComponent(`Your exam invite: ${test?.title || ""}`);
    const body = encodeURIComponent(
`Hi,

You've been invited to take the exam "${test?.title || ""}".

1. Sign in or create an account at: ${origin}/signup  (use this email: ${i.email})
2. Open the exam: ${link}
3. When asked, enter your access code: ${i.code}

Notes:
- The exam runs in fullscreen and uses your webcam.
- Copy/paste and tab-switching are disabled.
- For maximum lockdown, install Safe Exam Browser (https://safeexambrowser.org) and use the .seb config the admin will send.

Good luck.`);
    return `mailto:${i.email}?subject=${subject}&body=${body}`;
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <a href={`/admin/tests/${id}`} className="text-sm text-slate-600">← Back to test</a>
      <h1 className="text-2xl font-bold mt-2">Invites · {test?.title}</h1>

      <div className="card mt-6">
        <div className="text-sm font-medium">Add candidates by email</div>
        <p className="text-xs text-slate-500 mt-1">Paste one email per line (or comma/space separated). Each gets a unique access code.</p>
        <textarea className="input mt-2 min-h-[120px] font-mono text-sm" placeholder="alice@example.com&#10;bob@example.com" value={emails} onChange={(e) => setEmails(e.target.value)} />
        <div className="mt-2 flex gap-2">
          <button className="btn" onClick={addBatch} disabled={busy}>{busy ? "Adding…" : "Generate invites"}</button>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-semibold">{invites.length} invite{invites.length === 1 ? "" : "s"}</h2>
        {invites.length > 0 && (
          <div className="flex gap-2">
            <button className="btn" disabled={sending} onClick={async () => {
              if (!confirm(`Send invite emails to ${invites.length} candidate(s)?`)) return;
              setSending(true);
              const r = await fetch(`/api/admin/tests/${id}/invites/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
              const j = await r.json();
              setSending(false);
              if (!r.ok) return alert(j.error || "Send failed");
              alert(`Sent: ${j.sent}. Failed: ${j.failed?.length || 0}.${j.failed?.length ? "\n" + j.failed.map((f: any) => `${f.email}: ${f.error}`).join("\n") : ""}`);
            }}>{sending ? "Sending…" : "Send all (email)"}</button>
            <button className="btn-secondary" onClick={copyAll}>Copy all</button>
            <button className="btn-secondary" onClick={exportCsv}>Export CSV</button>
          </div>
        )}
      </div>

      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr><th className="py-2">Email</th><th>Code</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {invites.map((i) => (
            <tr key={i.id} className="border-t">
              <td className="py-2">{i.email}</td>
              <td><code className="font-mono">{i.code}</code></td>
              <td>{i.used_at ? <span className="text-green-700">used {new Date(i.used_at).toLocaleString()}</span> : <span className="text-slate-500">pending</span>}</td>
              <td className="text-right">
                <a href={mailtoLink(i)} className="text-blue-700 underline mr-3">email</a>
                <button className="text-red-600" onClick={() => remove(i.id)}>delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
