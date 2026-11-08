---
name: image-gen-openai
description: Generate or edit game textures/images/sprites via the OpenAI Images API using the project's scripts/gen-image.mjs. Use whenever an image, texture, sprite or atlas asset is needed (e.g. 修仙农场 assets/textures/), or the user says "generate an image". Replaces the old codex-texture skill.
---

# OpenAI image generation

## Rules
- **Never read, print, cat, source or grep `.env`.** The script loads `OPENAI_API_KEY` from `.env` itself and never prints it. Deny rules in `.claude/settings.json` block direct access. Don't echo error bodies that might contain key fragments.
- **Where the key comes from:**
  - *Local (desktop / CLI):* `.env` at the repo root holds `OPENAI_API_KEY=...`.
  - *Cloud session (claude.ai/code, environment "XiuXianFarmCloud"):* there is no `.env` and no key in the environment. The environment has a **Bearer secret for `api.openai.com`** and the cloud proxy adds the `Authorization` header to outgoing requests. The script sees `CLAUDE_CODE_REMOTE=true`, sends no auth header, and lets the proxy add it. Don't create a `.env`, ask for the key, or set a placeholder. If it returns HTTP 401, the secret is missing or wrong; tell the user to check the environment's secret settings.
  - If `OPENAI_BASE_URL` points anywhere other than `api.openai.com`, the cloud secret won't be injected.
- **Default model: `gpt-image-2.5-sunburst`** (best quality/edit precision). Use `gpt-image-2.5-flare` (faster, smaller) **only when the user asks for faster generation**.
- **Default quality: `medium`**, always, unless the user asks otherwise (`low`, `high`, `xhigh`, `max` are valid).
- Each generation costs money: don't loop many variants without asking.
- Check the repo's `scripts/gen-image.mjs` exists; if not, recreate it (POST `{base}/images/generations` with `{model,prompt,size,quality,n:1}`, bearer key from env or `.env`, or no auth header when `CLAUDE_CODE_REMOTE=true` and no key; save `data[0].b64_json` as PNG; with `REF` set, multipart POST to `/images/edits` with `image`).

## Usage (same command locally and in the cloud)
```bash
# new image
node scripts/gen-image.mjs assets/textures/<name>.png "<prompt>" [model] [size] [quality]
# new image using a reference (style only / edit)
REF=assets/textures/old.png node scripts/gen-image.mjs assets/textures/<name>.png "<prompt>"
```
PowerShell: `$env:REF="..."; node scripts/gen-image.mjs ...`. Needs Node ≥ 20.12 (for `process.loadEnvFile`). The old `node --env-file=.env ...` form still works locally, but don't use it in the cloud: it fails because there's no `.env` file there.
Optional `OPENAI_BASE_URL` for a gateway (default `https://api.openai.com/v1`). Sizes: 1024x1024, 1536x1024, 1024x1536 (custom WxH in multiples of 16, ratio ≤3:1).

## After generating
1. **Read the PNG** to look at it, and report honestly what's good and what isn't.
2. For tileable textures, check seams (tile 2x2) and repeating patterns; the API has no tiling guidance. A prompt that says "no rows, no diagonal lines, no grid, irregular organic placement, vary clump size/rotation" helps. When asked to make a "new" one from a reference, say the reference is for style/palette/scale ONLY and the arrangement must differ.
3. Save under `assets/textures/` with a descriptive suffix (`.flare`, `.sunburst`, `.v3`). Keep earlier versions until the user picks one.
4. Don't wire into the game or commit unless asked; follow the project CLAUDE.md (version bump, STATUS.md) when committing. In a cloud session, generated files exist only in that session's checkout. Commit and push them (when asked) or the user won't get them.

## Prompt tips (from OpenAI image prompting guide)
Name materials, lighting, colors and the visual medium; define the intended use and composition; list exclusions explicitly ("no text, no shadows, no border"); for edits say "change only X" and list what to preserve; for transparent cutouts use `background: "transparent"` with PNG/WebP and verify alpha (not wired into the script yet). Newer `gpt-image-2.6-sunburst/flare` models are named in the docs; unverified for this key.

## Project style prompt (grass example)
"Seamless tileable square ground texture, 50° overhead view, stylized hand-painted chibi Chinese xianxia farming game, soft painterly clumps (not thousands of tiny blades), muted natural greens, low-contrast patches, tiny clover hint, even lighting, no cast shadows/flowers/rocks/text/border, edges wrap on all four sides."
