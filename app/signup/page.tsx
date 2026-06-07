"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const supabase = createClient();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    // Role is hard-locked to candidate. Admins are provisioned via SQL/dashboard.
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role: "candidate" } },
    });
    if (error) { setLoading(false); return setErr(error.message); }
    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <main className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold">Create candidate account</h1>
      <p className="text-sm text-slate-600 mt-1">Already invited? Use the email your administrator sent invites to.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input className="input" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password (min 6)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full justify-center" disabled={loading}>{loading ? "Creating…" : "Sign up"}</button>
      </form>
      <p className="mt-4 text-sm text-slate-600">Already have an account? <Link href="/login" className="underline">Sign in</Link></p>
    </main>
  );
}
