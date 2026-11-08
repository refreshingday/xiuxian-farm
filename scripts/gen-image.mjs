// Generate an image via the OpenAI Images API. The key is read from the
// environment and never printed.
//   node scripts/gen-image.mjs <out.png> "<prompt>" [model] [size] [quality]
// Key sources, in order:
//   1. OPENAI_API_KEY already in the environment (or via node --env-file=.env)
//   2. ./.env, loaded automatically if it exists (local machine)
//   3. Claude cloud session (CLAUDE_CODE_REMOTE=true) with no key: send no
//      Authorization header; the environment's Bearer secret for
//      api.openai.com is injected by the cloud proxy.
// Defaults: model gpt-image-2.5-sunburst (use gpt-image-2.5-flare only when speed is asked for), quality medium
// Optional: REF=<image.png> uses a reference image (images/edits endpoint)
// Optional: TRANSPARENT=1 requests a true alpha-channel PNG (background: transparent)
// Optional: OPENAI_BASE_URL (default https://api.openai.com/v1)
import fs from "node:fs";
import path from "node:path";

const [out, prompt, model = "gpt-image-2.5-sunburst", size = "1024x1024", quality = "medium"] = process.argv.slice(2);
if (!out || !prompt) {
  console.error('usage: node scripts/gen-image.mjs <out.png> "<prompt>" [model] [size] [quality]');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY && fs.existsSync(".env")) {
  try { process.loadEnvFile(".env"); } catch {}
}
const key = process.env.OPENAI_API_KEY;
const cloud = process.env.CLAUDE_CODE_REMOTE === "true";
if (!key && !cloud) {
  console.error("OPENAI_API_KEY not set (put it in .env, or run in a Claude cloud environment with the api.openai.com secret)");
  process.exit(1);
}
// No key in the cloud: leave Authorization off so the proxy adds the secret.
const auth = key ? { Authorization: `Bearer ${key}` } : {};
const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

let res;
if (process.env.REF) {
  const fd = new FormData();
  fd.append("model", model);
  fd.append("prompt", prompt);
  fd.append("size", size);
  fd.append("quality", quality);
  if (process.env.TRANSPARENT) { fd.append("background", "transparent"); fd.append("output_format", "png"); }
  fd.append("image", new Blob([fs.readFileSync(process.env.REF)], { type: "image/png" }), "ref.png");
  res = await fetch(`${base}/images/edits`, { method: "POST", headers: { ...auth }, body: fd });
} else {
  res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ model, prompt, size, quality, n: 1, ...(process.env.TRANSPARENT ? { background: "transparent", output_format: "png" } : {}) }),
  });
}
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  // Print only status + error code/type, never echo request headers or the key.
  console.error(`HTTP ${res.status}`, body?.error?.code || body?.error?.type || "");
  if (res.status === 401 && !key) console.error("cloud: no secret was injected; check the api.openai.com Bearer secret on this environment");
  process.exit(1);
}
const item = body.data?.[0];
let buf;
if (item?.b64_json) buf = Buffer.from(item.b64_json, "base64");
else if (item?.url) buf = Buffer.from(await (await fetch(item.url)).arrayBuffer());
else {
  console.error("no image in response");
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`saved ${out} (${buf.length} bytes)`);
