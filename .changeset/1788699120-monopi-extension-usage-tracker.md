---
monopi-group: patch
---

# Show consumed quota percentage in the usage tracker widget

The widget displayed the remaining budget (e.g. 16.3%) where provider dashboards display the consumed amount (e.g. 83.8% used), so Ollama Cloud (and every other provider's) quota state read inverted versus the web UI. The widget now renders percent used with the progress bar filling as the quota is consumed; the detailed report keeps showing both left and used.
