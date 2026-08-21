#!/usr/bin/env node

// Unscoped npm alias for `@monopi/monopi`. Installing `monopi` from npm gives
// you the same `npx monopi` entrypoint as `npx @monopi/monopi`.
await import("@monopi/monopi/bin/monopi.mjs");
