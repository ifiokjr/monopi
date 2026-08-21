---
monopi-group: patch
---

Fix Ollama Cloud model metadata overrides for cloud-suffixed model ids (e.g. `deepseek-v4-flash:cloud`). The override lookup now strips the `:cloud` suffix so cloud variants inherit the correct context window and max tokens, restoring `deepseek-v4-flash:cloud` to its 1M context window instead of falling back to the cloud API's 256k default.
