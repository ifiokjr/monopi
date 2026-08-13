---
monopi: patch
---

Bump the `nanoid` override to `3.3.18` to resolve the high-severity advisory GHSA-2v37-7h3g-55p8 (custom generators can loop indefinitely when size is zero) reached via `postcss` in the analytics dashboard dev dependency tree.
