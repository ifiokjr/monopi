---
monopi-group: minor
---

# Add Z.AI (GLM Coding Plan) usage tracking to the usage tracker

Adds a `zai` provider probe to the usage tracker that queries Z.AI's monitor endpoint (`/api/monitor/usage/quota/limit`), surfacing the coding plan's 5-hour session and weekly (7d) quota windows as percentage-left bars with reset countdowns. The probe reads the API key from pi's `zai` auth entry or `ZAI_API_KEY`/`ZHIPU_API_KEY`, and falls back from `api.z.ai` to `open.bigmodel.cn` for China-region keys. GLM models under the `zai`, `zai-coding-plan`, `zhipuai`, and `zhipuai-coding-plan` provider slugs now attribute quota usage to the Z.AI card in the widget, dashboard, and `usage_report` output.
