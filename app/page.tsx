import Link from "next/link";

const features = [
  {
    title: "Proctoring",
    body: "Forced fullscreen, clipboard block, tab-switch detection, periodic webcam snapshots, auto-submit on violations.",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h16.5v9.75H3.75zM8.25 19.5h7.5M12 14.25v5.25" />
    ),
  },
  {
    title: "SEB-locked",
    body: "One-click Safe Exam Browser config. Server verifies the BEK hash so only SEB can load the exam.",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75M5.25 10.5h13.5v9.75H5.25z" />
    ),
  },
  {
    title: "Invite-only",
    body: "Single-use codes locked to specific emails. Strangers can't even see the test exists.",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    ),
  },
  {
    title: "Server-side grading",
    body: "Correct answers live in an admin-only RLS-isolated table. Candidates can't query them — even with crafted API calls.",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    ),
  },
  {
    title: "Image questions",
    body: "Upload images on the question prompt or any MCQ option. MCQ + long-answer types supported.",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    ),
  },
  {
    title: "Free to host",
    body: "Runs on Vercel + Supabase free tiers. Handles thousands of candidates at roughly $0.",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4" />
    ),
  },
];

const Icon = ({ d }: { d: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5">
    {d}
  </svg>
);

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      {/* Background: dotted grid + radial glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[700px] bg-radial-glow" />

      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-slate-950/60 border-b border-white/5">
        <nav className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/logo.jpg" alt="Logo" className="h-6 w-6 rounded-md object-cover" />
            <span>Take A Test</span>
            <span className="ml-1.5 text-[10px] uppercase tracking-wider text-slate-400 border border-white/10 px-1.5 py-0.5 rounded">v1.0</span>
          </Link>
          <div className="flex items-center gap-1 text-sm">
            <a href="https://github.com/ExPl0iT-29/take-a-test" target="_blank" rel="noreferrer"
               className="px-3 py-1.5 rounded-md hover:bg-white/5 text-slate-300 hover:text-white transition">GitHub</a>
            <Link href="/login" className="px-3 py-1.5 rounded-md hover:bg-white/5 text-slate-300 hover:text-white transition">Sign in</Link>
            <Link href="/signup" className="ml-2 px-3 py-1.5 rounded-md bg-white text-slate-900 font-medium hover:bg-slate-200 transition">
              Get started
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6">
        <section className="pt-24 pb-20 text-center">
          <a href="https://github.com/ExPl0iT-29/take-a-test" target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-2 text-xs text-slate-300 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 hover:bg-white/10 transition">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Open source · MIT licensed
            <span className="text-slate-500">→</span>
          </a>

          <h1 className="mt-6 text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            Proctored exams,
            <br />
            <span className="bg-gradient-to-r from-indigo-300 via-fuchsia-300 to-rose-300 bg-clip-text text-transparent">
              without the per-seat fees.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl mx-auto text-lg text-slate-400 leading-relaxed">
            Self-hostable exam platform with Safe Exam Browser lockdown, webcam snapshots,
            invite-only allowlists, and server-side grading. Next.js + Supabase.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup"
                  className="inline-flex items-center gap-2 rounded-md bg-white text-slate-900 font-medium px-5 py-2.5 hover:bg-slate-200 transition">
              Get started
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <a href="https://take-a-test.vercel.app" target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-5 py-2.5 hover:bg-white/10 transition">
              Live demo
            </a>
            <a href="https://github.com/ExPl0iT-29/take-a-test" target="_blank" rel="noreferrer"
               className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-5 py-2.5 hover:bg-white/10 transition">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58v-2c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .1-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.39 1.24-3.23-.13-.3-.54-1.52.11-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.65.25 2.87.12 3.17.77.84 1.23 1.92 1.23 3.23 0 4.61-2.81 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.21.69.83.57A12 12 0 0 0 12 .5Z" />
              </svg>
              Star on GitHub
            </a>
          </div>
        </section>

        {/* Terminal preview */}
        <section className="pb-20">
          <div className="mx-auto max-w-3xl rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur shadow-2xl shadow-indigo-500/5 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-black/20">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              <span className="ml-3 text-xs text-slate-500 font-mono">supabase/schema.sql · server-side grading</span>
            </div>
            <pre className="px-5 py-4 text-[13px] leading-relaxed font-mono text-slate-300 overflow-x-auto">
{`-- Correct answers live in an admin-only table.
-- Candidates can't read it — even via direct API calls.
create table answer_keys (
  question_id uuid primary key references questions(id),
  correct     jsonb
);

alter table answer_keys enable row level security;
create policy "admin_only" on answer_keys for all
  using (exists(select 1 from profiles
                where id = `}<span className="text-fuchsia-300">auth.uid()</span>{`
                  and role = 'admin'));

-- Grading runs in a SECURITY DEFINER function so the
-- client never has to fetch the correct answers.
`}<span className="text-indigo-300">submit_attempt(</span>{`attempt_id, terminated`}<span className="text-indigo-300">)</span>{` → void`}
            </pre>
          </div>
        </section>

        {/* Features */}
        <section className="pb-24">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-indigo-300 uppercase tracking-wider">Features</p>
            <h2 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight">What's in the box.</h2>
            <p className="mt-3 text-slate-400 max-w-xl mx-auto">Self-hosted. No per-candidate billing.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => (
              <div key={f.title}
                   className="group rounded-xl border border-white/10 bg-white/[0.02] p-5 hover:bg-white/[0.04] hover:border-white/20 transition">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-indigo-300 ring-1 ring-inset ring-white/10">
                  <Icon d={f.icon} />
                </div>
                <h3 className="mt-4 font-semibold text-slate-100">{f.title}</h3>
                <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Stack strip */}
        <section className="pb-24">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-8 md:p-10 text-center">
            <p className="text-sm font-medium text-indigo-300 uppercase tracking-wider">Stack</p>
            <h3 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight">Next.js + Supabase.</h3>
            <p className="mt-3 text-slate-400 max-w-xl mx-auto">
              Postgres with Row-Level Security, Auth, and Storage. Safe Exam Browser is optional.
              <code className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-xs">npx vercel deploy</code> to ship.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
              {["Next.js 15", "TypeScript", "Supabase", "Tailwind", "SEB", "MIT"].map((t) => (
                <span key={t} className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{t}</span>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-8">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <div>
            © {new Date().getFullYear()} Take A Test · MIT
          </div>
          <div className="flex items-center gap-5">
            <a href="https://github.com/ExPl0iT-29/take-a-test" target="_blank" rel="noreferrer"
               className="hover:text-slate-300 transition">GitHub</a>
            <a href="https://take-a-test.vercel.app" target="_blank" rel="noreferrer"
               className="hover:text-slate-300 transition">Demo</a>
            <a href="https://safeexambrowser.org" target="_blank" rel="noreferrer"
               className="hover:text-slate-300 transition">SEB</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
