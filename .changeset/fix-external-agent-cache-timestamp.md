---
monopi-group: patch
---

# Re-read external agents when a save does not change the timestamp

External agent resolution cached a prompt until `mtime` changed. On filesystems that stamp back-to-back writes with the same `mtime`, editing `.pi/agents/<name>.md` and resolving again kept the previous system prompt. Cache checks now also compare file size and contents.
