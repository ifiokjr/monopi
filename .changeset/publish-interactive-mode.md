---
monopi-group: patch
---

# Publish workflow supports interactive npm 2FA prompts

`monochange run publish --interactive` runs the publish command with inherited stdio via the Command step's interactive input, so npm can prompt for 2FA and own the terminal. Without the flag the command runs non-interactively as before.
