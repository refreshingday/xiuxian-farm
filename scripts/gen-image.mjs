// Generate an image via the OpenAI Images API. The key is read from the
// environment and never printed.
//   node --env-file=.env scripts/gen-image.mjs <out.png> "<prompt>" [model] [size] [quality]
// Defaults: model gpt-image-2.5-sunburst (use gpt-image-2.5-flare only when speed is asked for), quality medium
// Optional: REF=<image.png> uses a reference image (images/edits endpoint)
// Optional: OPENAI_BASE_URL (default https://api.openai.com/v1)
import fs from "node:fs";
import path from "node:path";

const [out, prompt, model = "gpt-image-2.5-sunburst", size = "1024x1024", quality = "medium"] = process.argv.slice(2);
if (!out || !prompt) {
  console.error('usage: node --env-file=.env scripts/gen-image.mjs <out.png> "<prompt>" [model] [size]');
  process.exit(1);
}
const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error("OPENAI_API_KEY not set (run with --env-file=.env)");
  process.exit(1);
}
const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

let res;
if (process.env.REF) {
  const fd = new FormData();
  fd.append("model", model);
  fd.append("prompt", prompt);
  fd.append("size", size);
  fd.append("quality", quality);
  fd.append("image", new Blob([fs.readFileSync(process.env.REF)], { type: "image/png" }), "ref.png");
  res = await fetch(`${base}/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
} else {
  res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
  });
}
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  // Print only status + error code/type, never echo request headers or the key.
  console.error(`HTTP ${res.status}`, body?.error?.code || body?.error?.type || "");
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
