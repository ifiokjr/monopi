---
monopi-group: patch
---

# Add a Cursor cloud agent install entrypoint

Fresh cloud agents install the pnpm version pinned in package.json and the workspace dependencies from `.cursor/install.sh`. Native modules such as `better-sqlite3` and `node-pty` build with the compilers already present on the default Linux image.
