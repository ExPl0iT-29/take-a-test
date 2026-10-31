"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function MfaInner() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next") || "/dashboard";
  // Same open-redirect guard as /login — internal paths only.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") { setEnrolled(true); setLoading(false); return; }

      const { data: factors } = await supabase.auth.mfa.listFactors();
      const existingTotp = factors?.totp?.find((f) => f.status === "verified" || f.status === "unverified");
      if (existingTotp && existingTotp.status === "verified") {
        // Verified factor exists but this session is still aal1 — needs a
        // fresh challenge/verify (handled by Supabase's own login flow
        // normally; here we just let them re-enroll a factor if stuck).
        setEnrolled(false);
      }
      if (existingTotp) {
        setFactorId(existingTotp.id);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) { setErr(error.message); setLoading(false); return; }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setLoading(false);
    })();
  }, [supabase]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true); setErr(null);
    const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr) { setBusy(false); setErr(chErr.message); return; }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (error) { setBusy(false); return setErr(error.message); }
    // Same fix as /login: stay busy until the redirect actually lands
    // instead of flashing the button back while /admin's layout re-checks
    // aal (now aal2) and finishes navigating.
    router.push(next);
    router.refresh();
  };

  if (loading) return <main className="max-w-md mx-auto px-6 py-16">Loading…</main>;

  if (enrolled) {
    return (
      <main className="max-w-md mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">Two-factor already set up</h1>
        <p className="text-slate-600 mt-3">Your admin account already has TOTP enabled and verified for this session.</p>
        <a href={next} className="btn mt-6 inline-flex">Continue</a>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold">Set up two-factor authentication</h1>
      <p className="text-slate-600 mt-2">
        Admin access requires TOTP. Scan this with an authenticator app (Google Authenticator, 1Password, Authy…),
        then enter the 6-digit code it shows.
      </p>

      {qr && (
        <div className="mt-6 flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="TOTP QR code" className="w-48 h-48 border rounded" />
          {secret && (
            <p className="text-xs text-slate-500 break-all">
              Can&apos;t scan? Enter this key manually: <code className="font-mono">{secret}</code>
            </p>
          )}
        </div>
      )}

      <form onSubmit={verify} className="mt-6 space-y-4">
        <input
          className="input font-mono text-center text-lg tracking-widest"
          placeholder="000000"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button className="btn w-full" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify & enable"}</button>
      </form>
    </main>
  );
}

export default function MfaPage() {
  return (
    <Suspense>
      <MfaInner />
    </Suspense>
  );
}
