// Generate a sound effect via ElevenLabs. The key is read from ELEVENLABS_API_KEY.
//   node --env-file=.env.local scripts/gen-sfx.mjs <out.mp3> "<prompt>" [duration_seconds] [prompt_influence]
import fs from "node:fs";
import path from "node:path";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const [out, text, dur, infl] = process.argv.slice(2);
if (!out || !text) {
  console.error('usage: node --env-file=.env.local scripts/gen-sfx.mjs <out.mp3> "<prompt>" [seconds] [influence]');
  process.exit(1);
}
const client = new ElevenLabsClient();
const audio = await client.textToSoundEffects.convert({
  text,
  modelId: "eleven_text_to_sound_v3",
  ...(dur ? { durationSeconds: Number(dur) } : {}),
  ...(infl ? { promptInfluence: Number(infl) } : {}),
});
const chunks = [];
for await (const c of audio) chunks.push(c);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat(chunks));
console.log("wrote", out);
