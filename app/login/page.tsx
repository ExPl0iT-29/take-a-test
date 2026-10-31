"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function LoginInner() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next") || "/dashboard";
  // Only allow internal paths — reject absolute/protocol-relative URLs
  // (e.g. "https://evil.com" or "//evil.com") to prevent open redirect.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setLoading(false); return setErr(error.message); }
    // Stay in the loading state until the page actually navigates away —
    // resetting it here made the button flash back to "Sign in" while the
    // redirect (which can chain through /dashboard -> /admin -> /mfa) was
    // still in flight, looking like the click did nothing.
    router.push(next);
    router.refresh();
  };

  return (
    <main className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full justify-center" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="mt-4 text-sm text-slate-600">No account? <Link href="/signup" className="underline">Sign up</Link></p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-10">Loading…</main>}>
      <LoginInner />
    </Suspense>
  );
}
