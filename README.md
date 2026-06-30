# Take A Test

Self-hostable proctored exam platform. Fullscreen lock, webcam snapshots, clipboard block, Safe Exam Browser integration, invite-only allowlist, and server-side grading where correct answers don't reach the client.

**Live demo:** https://take-a-test.vercel.app

Next.js 14 + Supabase + Tailwind. Runs on Vercel + Supabase free tiers.

---

## Why this exists

I needed to run a proctored exam for ~45 candidates and the commercial options (ProctorU, Honorlock, Examity, Mettl) charge $5–50 per test-taker and keep the data in their cloud. This is what I built instead. The code is here in case it's useful to anyone running coaching institutes, bootcamps, or hiring screens.

## Features

### Proctoring
- **Forced fullscreen** — exiting the fullscreen view counts as a violation.
- **Clipboard block** — copy / paste / cut, right-click, dev tools, PrintScreen, common shortcuts disabled.
- **Tab and window blur detection** — every focus loss is logged.
- **Webcam snapshot every 15s**, uploaded to a private bucket.
- **Camera-off detection.**
- **Auto-submit after 3 violations** (configurable).
- **Auto-submit on timer expiry.**

### Safe Exam Browser (SEB) integration
- Per-test `.seb` config download.
- Server verifies the `X-SafeExamBrowser-RequestHash` against your Browser Exam Key.
- Normal browsers see an "Open in SEB" page instead of the exam.
- OS-level lockdown: no alt-tab, no screen share, no second monitor, no cross-app clipboard.

### Test management
- MCQ (single + multi answer) and long-answer questions.
- Image uploads on prompts and individual options.
- Per-test duration and per-question points.
- Draft / published states.
- Delete cascades to questions, attempts, answers, invites, and proctor events.

### Candidate access control
- Invite-only allowlist — only pre-approved emails see the test exists.
- Single-use access codes per candidate, locked to the user account that consumes them.
- Bulk invite email send via Supabase Auth admin API.
- CSV export + mailto fallback if you don't have a service role key set.

### Grading & review
- MCQ auto-graded server-side via a `SECURITY DEFINER` SQL function. Correct answers never reach the client.
- Manual grading UI for long-answer questions with per-answer feedback.
- Snapshot gallery per attempt.
- Full proctor event log with timestamps.
- Attempt total recomputes when a manual grade is saved.

### Security
- Row-Level Security on every table.
- Correct answers live in a separate `answer_keys` table with an admin-only policy.
- Rate-limited unlock attempts (5 per 10 minutes per candidate).
- Security headers: HSTS, CSP, X-Frame-Options, Permissions-Policy.
- Snapshot upload policy enforces the storage path matches the candidate's own attempt id.
- No broad SELECT policy on the public `question-images` bucket (no file listing).

---

## Quick start

### 1. Clone + install
```bash
git clone https://github.com/ExPl0iT-29/take-a-test.git
cd take-a-test
npm install
```

### 2. Spin up Supabase
Create a project at https://supabase.com, then paste the contents of [`supabase/schema.sql`](./supabase/schema.sql) into the SQL editor and run.

That file creates every table, RLS policy, the signup trigger, the grading function, and both storage buckets with their policies.

### 3. Configure env
```bash
cp .env.local.example .env.local
```
Fill in:
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Supabase → Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — only needed for the bulk invite-email button.
- `SEB_ENFORCE` and `SEB_BROWSER_EXAM_KEY` — only if you want SEB hash verification on.

### 4. Run
```bash
npm run dev
```
Open http://localhost:3000.

### 5. Make yourself admin
Sign up at `/signup`, then in the Supabase SQL editor:
```sql
update profiles set role='admin' where email='you@example.com';
```
Sign out and back in. The dashboard redirects to `/admin`.

### 6. Deploy
```bash
npx vercel deploy --prod
```
After deploying, update Supabase → Authentication → URL Configuration:
- **Site URL**: your prod URL.
- **Redirect URLs**: `https://your-domain.com/**`.

---

## Safe Exam Browser setup

1. From a published test's admin page, click **Download .seb config**.
2. Install SEB: https://safeexambrowser.org/download_en.html.
3. Open the `.seb` in **SEB Configuration Tool** → **Exam** tab → **Generate Browser Exam Key** → copy the hex.
4. Save the `.seb`.
5. Set in your env:
   ```
   SEB_ENFORCE=true
   SEB_BROWSER_EXAM_KEY=<the hex>
   ```
   Redeploy.
6. Distribute the `.seb` along with SEB install instructions.

Without SEB, the per-test `Require SEB` toggle still gates on the presence of the request header (weaker — header can be spoofed). The env-level BEK is the only way to actually verify SEB sent the request.

---

## Architecture

```
┌────────────────┐   ┌─────────────────────┐   ┌─────────────────────────┐
│  Candidate     │   │  Next.js on Vercel  │   │  Supabase               │
│  (Chrome/SEB)  │──▶│  - App Router       │──▶│  - Postgres + RLS       │
│                │   │  - Server actions   │   │  - Auth                 │
│  Webcam ──┐    │   │  - API routes       │   │  - Storage (snapshots,  │
│           │    │   │                     │   │    question-images)     │
└───────────┼────┘   └─────────────────────┘   └─────────────────────────┘
            │
            └───── snapshots every 15s ───────────────────▶ private bucket
```

Design notes:
- Correct answers live in `answer_keys` (admin-only RLS) — not readable by candidates via the PostgREST API.
- Grading runs in a `SECURITY DEFINER` Postgres function (`submit_attempt`). The function checks `auth.uid()` matches the attempt's `candidate_id` before doing anything.
- Snapshots are stored at `<attempt_id>/<timestamp>.jpg`; the storage policy enforces the path's first folder matches an attempt the uploader owns.
- Per-candidate codes use a 32-char alphabet excluding `0/O/1/I` to avoid typos.

See `supabase/schema.sql` for the full data model.

---

## Tech stack

- **Framework**: Next.js 15 (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **Backend**: Supabase (Postgres + Auth + Storage)
- **Lockdown**: Safe Exam Browser (optional)
- **Deploy**: Vercel

## Limitations

- Browsers can't prevent OS-level screen sharing from a webpage (Zoom, OBS). SEB closes this gap; without it you can only detect focus loss.
- A candidate with DevTools open can disable JS before navigating to the exam URL. Use SEB + BEK enforcement to make this irrelevant.
- Long-answer questions are graded manually.
- Single-tenant — multiple isolated organisations would need a workspaces feature.
- Desktop-only by design.

---

## Roadmap

- [ ] Multi-tenant workspaces.
- [ ] Question bank / reuse across tests.
- [ ] CSV import for questions.
- [ ] Test scheduling windows.
- [ ] Question randomisation.
- [ ] Auto-send results email.
- [ ] Full webcam video capture instead of snapshots.
- [ ] LMS integrations (Moodle, Canvas).

## Contributing

PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT — see [LICENSE](./LICENSE).
