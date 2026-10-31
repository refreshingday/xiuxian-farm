# 灵田问道 — notes for Claude

- **Bump the version on every commit.** Edit `VERSION` in `src/version.js` (format `YYYY.MM.DD.N`, N = nth commit that day). It shows as a small overlay at the bottom-right of `index.html`, `arena.html` and `lab.html` so the user can tell whether the hosted page is up to date.
- Update `STATUS.md` when a feature lands or changes level.
- Push to the session branch **and** `main`. Before pushing `main`, `git fetch origin main` and merge it — other sessions push there too; never skip the push silently.
- Hosted page: https://refreshingday.github.io/xiuxian-farm/ — always include this link in replies to the user.

## 音效禁令
- 符的音效（掐诀 chant / 符炸 talisBoom）永远不要用 ring()、高音 sine/triangle 或 2kHz 以上的滤波噪声——"叮 / tin"的金属声已被用户否决，任何类似的声音都不要再做。只用低频闷响 + 低通噪声。
