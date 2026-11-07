---
name: sfx-gen-elevenlab
description: Generate game sound effects (sword swings, hits, spells, ambience, UI sounds) from a text prompt via ElevenLabs using the project's scripts/gen-sfx.mjs. Use whenever a recorded-style SFX asset is needed (e.g. 修仙农场 assets/audio/), or the user says "generate a sound effect" / "ElevenLabs sfx".
---

# ElevenLabs SFX generation

## Rules
- **Never read, print, cat, source or grep `.env.local`.** `ELEVENLABS_API_KEY` is loaded by Node via `--env-file=.env.local`; never put it in code or chat. Verify setup with `npx -y @elevenlabs/cli@latest onboard check --env-path .env.local`.
- **The "no ring / no metallic / no tin" sound bans in the project CLAUDE.md apply ONLY to synthetic WebAudio sounds written in code.** They do NOT apply to ElevenLabs prompts. Don't add "no metallic ring" etc. to prompts; a sword clash may legitimately ring. Describe the sound the user actually wants.
- Model is always `eleven_text_to_sound_v3` (script sets it).
- Each generation uses credits: one take unless asked for variants; don't loop.
- If `scripts/gen-sfx.mjs` is missing, recreate it: `ElevenLabsClient().textToSoundEffects.convert({text, modelId:"eleven_text_to_sound_v3", durationSeconds, promptInfluence})`, collect the stream chunks, write the mp3. Needs `npm i @elevenlabs/elevenlabs-js` (package.json is minimal, node_modules is gitignored).

## Usage
```bash
node --env-file=.env.local scripts/gen-sfx.mjs assets/audio/<name>.mp3 "<prompt>" [seconds 0.5-30] [influence 0-1]
```
Defaults: auto duration, influence 0.3 (use ~0.6 for short, precise one-shots).

## Prompt tips
- Be specific and layered: "Fast sword slash whoosh, blade cutting air, followed by a light steel impact".
- Say duration and style for one-shots: "short, dry, game SFX, no music, no voice".
- Chinese-fantasy flavour is fine: "xianxia talisman burst", "guqin pluck", "qi energy release".

## After generating
1. Report honestly: file path, size, duration; you can't hear it, so say so and ask the user to listen.
2. Save under `assets/audio/`; keep earlier takes with a suffix (`.v2`) until the user picks.
3. Don't wire into the game or commit unless asked; when committing follow the project CLAUDE.md (version bump, STATUS.md).
