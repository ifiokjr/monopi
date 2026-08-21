#!/usr/bin/env node
// Generate logo candidates via the Hugging Face Inference Providers router
// (fal-ai serving Tongyi-MAI/Z-Image-Turbo). Token comes from monosecret.
import fs from "node:fs";

const arg = (name, fallback = null) => {
	const i = process.argv.indexOf(`--${name}`);
	if (i === -1) return fallback;
	const v = process.argv[i + 1];
	return v && !v.startsWith("--") ? v : fallback;
};

const prompt = arg("prompt");
const out = arg("out");
const seed = arg("seed");
if (!prompt || !out) {
	console.error("usage: node generate.mjs --prompt ... --out file.png [--seed n]");
	process.exit(1);
}

const token = process.env.HUGGING_FACE_TOKEN;
if (!token) {
	console.error("HUGGING_FACE_TOKEN not set");
	process.exit(1);
}

const body = {
	prompt,
	image_size: { width: 1024, height: 1024 },
	num_inference_steps: 8,
	enable_safety_checker: true,
	output_format: "png",
};
if (seed !== null) body.seed = Number(seed);

const response = await fetch("https://router.huggingface.co/fal-ai/fal-ai/z-image/turbo", {
	method: "POST",
	headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
	body: JSON.stringify(body),
});
if (!response.ok) {
	console.error(`generate failed: ${response.status}: ${(await response.text()).slice(0, 300)}`);
	process.exit(1);
}
const json = await response.json();
const imageUrl = json?.images?.[0]?.url;
if (!imageUrl) {
	console.error(`no image in response: ${JSON.stringify(json).slice(0, 200)}`);
	process.exit(1);
}
const imageResponse = await fetch(imageUrl);
const buffer = Buffer.from(await imageResponse.arrayBuffer());
fs.writeFileSync(out, buffer);
console.log(`IMAGE: ${out} (${buffer.length} bytes, seed ${json.seed ?? seed ?? "?"})`);
