# 灵田问道 — notes for Claude

- **Bump the version on every commit.** Edit `VERSION` in `src/version.js` (format `YYYY.MM.DD.N`, N = nth commit that day). It shows as a small overlay at the bottom-right of `index.html`, `arena.html` and `lab.html` so the user can tell whether the hosted page is up to date.
- Update `STATUS.md` when a feature lands or changes level.
- Push to the session branch **and** `main`. Before pushing `main`, `git fetch origin main` and merge it — other sessions push there too; never skip the push silently.
- Hosted page: https://refreshingday.github.io/xiuxian-farm/ — always include this link in replies to the user.
