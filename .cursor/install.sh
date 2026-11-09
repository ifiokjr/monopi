#!/usr/bin/env bash
# Idempotent dependency install for Cursor cloud agents.
# Uses the pnpm version pinned in package.json so the agent matches CI.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
	echo "node is required (>=22.19.0) and was not found on PATH" >&2
	exit 1
fi

if ! command -v corepack >/dev/null 2>&1; then
	echo "corepack is required to activate the pinned pnpm version" >&2
	exit 1
fi

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

PNPM_SPEC="$(node --eval '
const pm = require("./package.json").packageManager ?? "";
if (!pm.startsWith("pnpm@")) {
	throw new Error("package.json packageManager must be pnpm@<version>");
}
process.stdout.write(pm);
')"

corepack enable
corepack prepare "$PNPM_SPEC" --activate
pnpm install --frozen-lockfile
