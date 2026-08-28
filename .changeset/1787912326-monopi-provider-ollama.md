---
monopi-group: patch
---

# Pin glm-5.3-flash Ollama Cloud metadata floor to the full 1M context window

glm-5.3-flash was missing from the Ollama Cloud metadata override catalog (the list stopped at glm-5.2). Discovery normally picks up the correct 1,048,576-token context length from the /api/show endpoint, but without a floor entry a stale credential cache or an API metadata gap would silently fall back to the 128k default and trigger premature compaction. Adds the authoritative floor (contextWindow 1,048,576, maxTokens 131,072, reasoning) plus tests covering fresh normalization and stale-cache repair.
