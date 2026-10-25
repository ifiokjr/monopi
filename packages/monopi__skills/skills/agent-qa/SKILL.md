---
name: agent-qa
description: Run agent-qa web/mobile tests and review recorded evidence. Use for agent-qa.config.yaml, existing agent-qa tests or run IDs, or an explicit request to use agent-qa; keep other testing workflows unchanged.
---

# agent-qa

Use [agent-qa by vostride](https://github.com/vostride/agent-qa) for natural-language web and mobile testing with recorded evidence, advanced memidex memory, and self-improvement.

## Select the project and task

Locate the application's instructions and `agent-qa.config.yaml`. Preserve its configured provider, target, test identity, and acceptance criteria. Distinguish running a journey from explaining a saved run; reviewing evidence does not require a new execution.

Use the project's installed version. From its directory, inspect the available contract:

```bash
npx --no-install agent-qa --version
npx --no-install agent-qa init --agent
npx --no-install agent-qa skills --json
```

`init --agent` reports capabilities without initializing the project. `skills --json` locates version-matched guidance. If the package or project setup is missing, use the [setup guide](https://vostride.com/docs/agent-qa/coding-agents) when setup is part of the task; report the missing prerequisite otherwise.

## Prepare and run

For an existing test, replace `TEST_FILE` with its actual path:

```bash
npx --no-install agent-qa --config ./agent-qa.config.yaml validate TEST_FILE
npx --no-install agent-qa --config ./agent-qa.config.yaml run TEST_FILE --dry-run
```

These check preparation and selection, not application behavior. When execution is requested, run the selected test without `--dry-run`, keep its actual run identity, and inspect its terminal result. Report provider, browser, or device setup failures separately from application failures.

For new or refined tests, load the packaged authoring guidance returned by discovery and use its supported operation. The host creates canonical entity IDs; do not invent IDs or copy another test's identity. Authoring or verification can call models and execute tests, so preserve an explicitly non-executing draft request. Read the write or refusal receipt before claiming a test was created.

Keep configured `{{secret:NAME}}` references in steps. Recorded `[secret:NAME]` markers are masked evidence, not input values.

## Review evidence and memory

Start with the requested run ID, or list completed runs:

```bash
npx --no-install agent-qa --config ./agent-qa.config.yaml runs list --json
npx --no-install agent-qa --config ./agent-qa.config.yaml digest RUN_ID --json
```

`digest` is a top-level command. Match the recorded target, test identity, completion time, and build to the request. An empty list means matching completed evidence was not returned; it does not establish a pass or rule out an active run.

Use the installed CLI help or connected agent-qa tools to inspect relevant steps and artifacts. Preserve zero-based test/step indices and IDs returned by readers. A reader error is not an empty successful result. Do not query or edit `.agent-qa/` databases, caches, or indexes directly.

For memory changes, read the policy in the project's committed `agent-qa-knowledge/AGENTS.md` and use supported operations within the requested scope. Distinguish knowledge a run consumed from knowledge it learned. A correction receipt does not prove a rerun, and changing an expected outcome does not prove the application was fixed.

Report the test, target, actual run ID, recorded outcome, and supporting evidence. Separate preparation checks, execution results, and knowledge changes. Review artifacts before sharing them; masking applies to configured secrets, not every sensitive value an application may display.
