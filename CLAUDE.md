# 灵田问道 — notes for Claude

- **Bump the version on every commit.** Edit `VERSION` in `src/version.js` (format `YYYY.MM.DD.N`, N = nth commit that day). It shows as a small overlay at the bottom-right of `index.html`, `arena.html` and `lab.html` so the user can tell whether the hosted page is up to date.
- Update `STATUS.md` when a feature lands or changes level.
- Environment rules live in `ENVIRONMENT.md` (e.g. every waterfall gets a small pond at its foot) — read it before touching terrain/water/trees, and add new rules there.
- Push to the session branch **and** `main`. Before pushing `main`, `git fetch origin main` and merge it — other sessions push there too; never skip the push silently.
- Hosted page: https://refreshingday.github.io/xiuxian-farm/ — always include this link in replies to the user.

## 音效禁令
- 入水 / 落地 / 水声同理：只用低通噪声（Q≤0.3），不要带音高的 sine/oscillator 和共振滤波——“像敲金属”已被用户否决。
- 入水 / 出水也不要做成快起音（<30ms）+ 300Hz 以下的低频“噗”——“像撞到很硬的东西”已被用户否决。水声要有中高频的“哗”（低通截止从 2–3kHz 往下扫）、响度随机起伏和回落的水珠（见 `src/lab/swim.js` 的 `waterVoice`）。
- 符的音效（掐诀 chant / 符炸 talisBoom）永远不要用 ring()、高音 sine/triangle 或 2kHz 以上的滤波噪声——"叮 / tin"的金属声已被用户否决，任何类似的声音都不要再做。只用低频闷响 + 低通噪声。
- **Always republish the lab Artifact (https://claude.ai/artifact/UPChGbRg2oGrwz2MgXcYU7) after every lab commit and open it for the user** — publish `pub/` (copy changed files incl. `src/version.js`, rebuild `pub/lab.html` from `lab.html`), then Artifact `open`. Don't wait to be asked.
