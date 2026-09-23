---
monopi-group: patch
---

# Keep a manually selected model so adaptive routing stops overriding it

Adaptive routing re-routed at the start of every turn, so a model chosen from the model picker or by another extension was silently swapped on the next prompt. A selection made outside routing now pins the model for the session, shows a lock in the status line, and suspends quota failover until /route unlock.
