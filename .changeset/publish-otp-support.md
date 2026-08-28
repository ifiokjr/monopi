---
monopi-group: patch
---

# Publish workflow supports npm 2FA one-time passwords

`monochange run publish` now accepts `--otp <code>` and forwards it as `--otp` to `pnpm -r publish`, so npm 2FA publishes work from non-interactive terminals. Omitting the flag leaves the command unchanged.
