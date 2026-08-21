# @monopi/extension-tool-metadata

<!-- {=extensionsToolMetadataOverview} -->

The tool-metadata extension enriches tool results with execution metadata so pi can show when a tool started, when it finished, how long it ran, and roughly how much text went in and out. It appends structured metadata to tool result details, which other features like diagnostics reuse for consistent timing displays. It also sanitizes oversized tool output and detail payloads so the TUI stays stable when tools return very large text blobs.

<!-- {/extensionsToolMetadataOverview} -->

## Install

```bash
pi install npm:@monopi/extension-tool-metadata
```

## What it adds to tool results

Each tool result gains start and end timestamps, a duration, approximate input and output sizes, and a context snapshot taken at completion. The metadata is appended to the result `details` field, so downstream features can render consistent timing information without recomputing it.

## Safety limits

Tool output is truncated at 120,000 characters, 2,000 characters per line, and 2,000 lines before it reaches the TUI. Detail payloads are capped at 256 fields and 6 levels of nesting. Both limits keep the interface responsive when a tool returns an enormous blob.
