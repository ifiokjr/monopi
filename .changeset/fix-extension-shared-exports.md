---
monopi: patch
---

Fix the shared extension package export map so raw TypeScript consumers resolve its entrypoint reliably, and keep isolated extension startup benchmarks focused on median regressions instead of async file-lock p95 outliers.
