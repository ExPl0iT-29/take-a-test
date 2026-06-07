# Contributing

Thanks for your interest! This is an early-stage project — small PRs and bug reports are the most useful contributions right now.

## Dev setup

1. Follow the README's "Quick start" to get a local Supabase + dev server running.
2. Create a feature branch from `main`.
3. Make sure `npm run build` succeeds before opening a PR.

## What's most useful

- **Bug fixes** — especially around proctoring edge cases (different browsers, OSes, webcam permission flows).
- **Multi-tenancy** — see the Roadmap in README. Big change, would unlock a lot.
- **Accessibility** — current UI has not been audited.
- **Internationalization** — strings are hard-coded in English.
- **Docs** — better setup guides, video walkthrough, sample tests.

## What to avoid in PRs

- Big architectural rewrites without discussion (open an issue first).
- New dependencies unless they meaningfully reduce code or solve a problem.
- Breaking schema changes without a migration in `supabase/schema.sql`.

## Reporting security issues

If you find a way for a candidate to read correct answers, bypass the invite-only allowlist, or otherwise undermine exam integrity — **don't open a public issue**. Email the maintainer first (see GitHub profile).

## License

By contributing, you agree your contributions are licensed under MIT.
