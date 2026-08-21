---
monopi-group: minor
---

# Subagent fleet inspector

Add a live fleet inspector for toggling between background subagent runs. Open it with `/fleet` or the new `ctrl+alt+f` shortcut (matching upstream pi-subagents). The list shows every async run with status, step progress, elapsed time, tokens and activity freshness; `enter` drills into a run to watch per-step status and a rolling output tail (`x` expands it), `esc` goes back, and the view auto-refreshes while open. The async widget header now hints the shortcut so the feature is discoverable.
