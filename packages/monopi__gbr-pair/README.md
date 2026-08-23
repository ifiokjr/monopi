# Build Remote Agent (pi / monopi)

Docs + MCP example so a phone running **Build Remote Agent** can pair to a
desktop `pi` session the same way it pairs to Grok Build.

This folder is **not** a full `@monopi/*` runtime package. Copy the snippet
below (or `mcp.json` next to this README) into `.mcp.json` / pi MCP config.
Do not add it to the installer inventory.

Website: https://grokbuildremote.com/
Agent: https://github.com/LinespottingOrg/GrokBuildRemote-Agents (MIT)
Protocol: `gbr/1` · need `gbr-agent` **v0.6.0+**

Independent product by Linespotting AB. Not affiliated with xAI or SpaceX.

Phone is spectator + veto, not orchestrator. This sits beside
`@monopi/web-remote` / Tailscale — it does not replace them.

## Pair

```bash
curl -fsSL https://grokbuildremote.com/install.sh | bash   # Windows: irm https://grokbuildremote.com/install.ps1 | iex
gbr-agent version    # need v0.6.0+
gbr-agent pair && gbr-agent run
```

Phone: Build Remote Agent → scan QR **or** type the 8-char code.
Unpair in Settings before changing PCs.

## Attach

After `gbr-agent run`:

| How | Where |
|-----|--------|
| Bot API | `http://127.0.0.1:8788` |
| MCP stdio | `gbr-mcp` (see `mcp.json`) |

```bash
git clone https://github.com/LinespottingOrg/GrokBuildRemote-Agents.git
cd GrokBuildRemote-Agents/mcp/gbr-mcp && npm install
# then point mcp.json args at that gbr-mcp.js (absolute path)
curl -sS http://127.0.0.1:8788/health
```

Never commit mailbox keys. Phone **Settings → Bot API** is the only place a
relay key is copied.
