---
monopi-group: minor
---

# Add Ollama Cloud per-token pricing and live usage tracking

Wires Ollama Cloud's published per-token pricing (ollama.com/pricing) into provider-ollama as model cost metadata, so the usage tracker shows the API-equivalent cost of every cloud request, including cached-input rates and tagged model variants (e.g. gpt-oss:20b vs gpt-oss:120b, deepseek-v4-flash:0731 inheriting base rates). Upgrades the usage tracker's Ollama probe to query ollama.com /api/usage, surfacing real session (5h) and weekly (7d) quota usage percentages plus Ollama's own 4-week API-equivalent billing total.
