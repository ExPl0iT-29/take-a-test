"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewTest() {
  const supabase = createClient();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(30);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("tests").insert({ title, description, duration_minutes: duration, owner_id: user.id }).select().single();
    if (error) return setErr(error.message);
    router.push(`/admin/tests/${data.id}`);
  };

  return (
    <main className="max-w-xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold">New test</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea className="input" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <label className="block text-sm">Duration (minutes)
          <input className="input mt-1" type="number" min={1} value={duration} onChange={(e) => setDuration(parseInt(e.target.value))} />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn">Create</button>
      </form>
    </main>
  );
}
