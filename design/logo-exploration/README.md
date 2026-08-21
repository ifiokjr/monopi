# monopi logo exploration

Ten AI-generated logo directions for monopi, produced with the Hugging Face
Inference Providers router (`Tongyi-MAI/Z-Image-Turbo` via fal-ai). The token
comes from `monosecret get HUGGING_FACE_TOKEN` and is never written to disk.

## Files

- `generate.mjs` — one image per call: `node generate.mjs --prompt "..." --out candidates/x.png [--seed n]`
- `prompts.json` — the ten candidate prompts, names, and descriptions
- `candidates/` — generated 1024x1024 PNGs
- `serve.mjs` — local gallery server (port 7331) with a `POST /feedback` endpoint
- `index.html` — interactive review page: pick a favourite, rate candidates,
  attach quick iteration chips, and submit feedback straight to the agent
- `feedback-log.json` — every submitted feedback entry, newest last

## Review loop

```bash
node serve.mjs          # then open http://localhost:7331
```

Submissions land in `feedback-log.json` and on the server's stdout, where the
running agent picks them up for the next iteration round.
