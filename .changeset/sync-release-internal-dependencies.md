---
monopi: patch
---

# Sync internal dependencies during releases

Update internal workspace dependency constraints after MonoChange bumps package versions and before pnpm regenerates the lockfile. This keeps local resolution and published package manifests aligned with the new lockstep version.
