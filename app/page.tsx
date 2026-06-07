import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-20">
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">Open source</span>
        <span>MIT licensed · Next.js + Supabase</span>
      </div>
      <h1 className="text-4xl font-bold tracking-tight">Take A Test</h1>
      <p className="mt-3 text-slate-600 text-lg">
        Self-hostable proctored exam platform. Fullscreen lock, webcam snapshots,
        clipboard block, Safe Exam Browser integration, invite-only allowlist —
        and answers that never leak to the client.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/login" className="btn">Sign in</Link>
        <Link href="/signup" className="btn-secondary">Create candidate account</Link>
        <a
          href="https://github.com/ExPl0iT-29/take-a-test"
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
        >★ Star on GitHub</a>
      </div>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <b>Real proctoring</b>
          <p className="text-sm text-slate-600 mt-1">Fullscreen, no copy/paste, tab-switch detection, periodic webcam snapshots, auto-submit on violations.</p>
        </div>
        <div className="card">
          <b>SEB-locked</b>
          <p className="text-sm text-slate-600 mt-1">One-click Safe Exam Browser config. Server validates the BEK hash so only SEB can open the exam.</p>
        </div>
        <div className="card">
          <b>Invite-only</b>
          <p className="text-sm text-slate-600 mt-1">Single-use codes locked to specific emails. Strangers can't even see the test exists.</p>
        </div>
        <div className="card">
          <b>Server-side grading</b>
          <p className="text-sm text-slate-600 mt-1">Correct answers live in an admin-only table. Candidates can't query them — even with crafted API calls.</p>
        </div>
        <div className="card">
          <b>Image questions</b>
          <p className="text-sm text-slate-600 mt-1">Upload images on the question prompt or any MCQ option. MCQ + long-answer types supported.</p>
        </div>
        <div className="card">
          <b>Free to host</b>
          <p className="text-sm text-slate-600 mt-1">Runs on Vercel + Supabase free tiers. Handles thousands of candidates at ~$0.</p>
        </div>
      </div>

      <footer className="mt-16 text-xs text-slate-400 text-center">
        Built with <a href="https://claude.com/claude-code" className="underline">Claude Code</a>.
        Source: <a href="https://github.com/ExPl0iT-29/take-a-test" className="underline">github.com/ExPl0iT-29/take-a-test</a>
      </footer>
    </main>
  );
}
