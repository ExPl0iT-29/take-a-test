# Take A Test

> Open-source proctored online exam platform. Fullscreen lock, webcam snapshots, clipboard block, Safe Exam Browser integration, invite-only allowlist, and server-side grading where answers never leak to the client.

**Live demo:** https://take-a-test.vercel.app

Built with Next.js 14 + Supabase + Tailwind. Deploys to Vercel + Supabase free tiers and handles thousands of candidates for ~$0.

---

## Why this exists

Commercial proctoring tools (ProctorU, Honorlock, Examity, Mettl) cost **$5–50 per test-taker**, lock data into proprietary clouds, and ship clunky UX. This is a self-hostable alternative for coaching institutes, bootcamps, hiring teams, and certification bodies that need a tight exam-day flow without per-seat fees.

## Features

### Proctoring
- 🖥️ **Forced fullscreen** — exiting counts as a violation
- 📋 **Clipboard block** — copy/paste/cut, right-click, dev tools, PrintScreen, common shortcuts all disabled
- 👀 **Tab/window blur detection** — every focus loss is logged
- 📸 **Webcam snapshots** every 15s, uploaded to private storage
- 🎥 **Camera-off detection** — if the candidate kills the camera mid-exam, it's logged
- 🚨 **Auto-submit after 3 violations** (configurable)
- ⏱️ **Auto-submit on timer expiry**

### Safe Exam Browser (SEB) integration
- One-click `.seb` config download per test
- Server validates `X-SafeExamBrowser-RequestHash` against your BEK
- Normal browsers get a friendly "Open in SEB" page
- Locks down OS-level: no alt-tab, no screen share, no second monitor, no clipboard across apps

### Test management
- MCQ (single/multi answer) + long-answer questions
- **Image uploads** on prompts and individual options
- Configurable duration, points per question
- Draft/published states
- One-click delete with cascade

### Candidate access control
- **Invite-only allowlist** — only pre-approved emails see the test
- **Single-use access codes** per candidate, locked to their user account
- **Send invites by email** (Supabase Auth admin API)
- CSV export + mailto fallback if you don't have the service role key set

### Grading & review
- MCQ auto-graded server-side via SECURITY DEFINER SQL function — correct answers never reach the client
- Manual grading UI for long-answer questions with per-answer feedback
- Webcam snapshot gallery per attempt
- Full proctor event log (timestamps, violation types)
- Attempt total recomputes when manual grades are saved

### Security
- Row-Level Security on every table
- Correct answers stored in a separate admin-only `answer_keys` table
- Server-side rate limiting on unlock attempts (5/10min)
- Strict security headers (HSTS, CSP, X-Frame-Options, Permissions-Policy)
- Snapshot storage policy enforces path matches candidate's own attempt
- Public bucket file-listing prevention

---

## Quick start

### 1. Clone + install
```bash
git clone https://github.com/ExPl0iT-29/take-a-test.git
cd take-a-test
npm install
```

### 2. Spin up Supabase
Create a project at https://supabase.com, then in the SQL editor run:
```bash
cat supabase/schema.sql | pbcopy   # or open the file and paste
```

In Storage:
- Create a **private** bucket named `snapshots`
- Create a **public** bucket named `question-images`
- Storage policies for both are at the bottom of `supabase/schema.sql` — run them too.

### 3. Configure env
```bash
cp .env.local.example .env.local
```
Fill in:
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Supabase → Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` (optional — needed only for the "Send invites by email" button)
- `SEB_ENFORCE` and `SEB_BROWSER_EXAM_KEY` (optional — only if you want SEB lockdown)

### 4. Run
```bash
npm run dev
```
Open http://localhost:3000.

### 5. Make yourself admin
Sign up at `/signup`, then in Supabase SQL editor:
```sql
update profiles set role='admin' where email='you@example.com';
```
Sign out and back in. You'll land on `/admin`.

### 6. Deploy
```bash
npx vercel deploy --prod
```
After deploying, update Supabase → Authentication → URL Configuration:
- **Site URL**: your prod URL
- **Redirect URLs**: `https://your-domain.com/**`

---

## Safe Exam Browser setup (optional but recommended for high-stakes)

1. From a published test's admin page, click **Download .seb config**.
2. Install SEB: https://safeexambrowser.org/download_en.html
3. Open the `.seb` in **SEB Configuration Tool** → **Exam** tab → **Generate Browser Exam Key** → copy the hex.
4. Save the `.seb`.
5. Set in your env:
   ```
   SEB_ENFORCE=true
   SEB_BROWSER_EXAM_KEY=<the hex>
   ```
   Redeploy.
6. Distribute the `.seb` to candidates along with SEB install instructions.

Now normal browsers get a "Open in SEB" page; only SEB requests with a matching BEK hash can load the exam.

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

**Key design choices:**
- Correct answers live in `answer_keys` (admin-only RLS) — never readable by candidates even via direct API calls.
- Grading runs in a SECURITY DEFINER Postgres function (`submit_attempt`) — no service-role key needed at runtime for grading.
- Webcam snapshots are stored at `<attempt_id>/<timestamp>.jpg` with a policy that enforces the path matches the uploader's own attempt.
- Per-candidate codes use a 32-char alphabet excluding visually ambiguous chars (no `0/O/1/I`).

See `supabase/schema.sql` for the full data model.

---

## Tech stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **Backend**: Supabase (Postgres + Auth + Storage)
- **Lockdown**: Safe Exam Browser (optional)
- **Deploy**: Vercel (free tier works)

## Limitations (honest)

- Browsers can't fully prevent **OS-level screen sharing** from a webpage (Zoom, OBS). SEB closes this gap; without SEB you can only detect focus loss.
- A determined attacker can disable JS via DevTools before opening the exam URL. SEB + BEK enforcement is the answer.
- Long-answer questions need **manual grading**.
- Currently **single-tenant**. Multiple isolated organizations would need a workspaces feature.
- No mobile fallback — exams are desktop-only on purpose.

---

## Roadmap (PRs welcome)

- [ ] Multi-tenant workspaces (each org has its own admins/tests/candidates)
- [ ] Question bank / reuse across tests
- [ ] CSV import for questions
- [ ] Test scheduling windows
- [ ] Question randomization
- [ ] Auto-send results email to candidates
- [ ] Full webcam **video** capture (not just snapshots)
- [ ] AI flagging of suspicious snapshots (face count, gaze direction)
- [ ] LMS integrations (Moodle, Canvas)

## Contributing

PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT — see [LICENSE](./LICENSE).

---

## Credits

Built end-to-end with a lot of help from [Claude Code](https://claude.com/claude-code). The schema, RLS policies, proctoring component, SEB hash verification, and admin tooling were paired-programmed with Claude in a single session.
