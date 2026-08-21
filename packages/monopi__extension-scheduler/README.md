# @monopi/extension-scheduler

<!-- {=extensionsSchedulerOverview} -->

The scheduler extension adds recurring checks, one-time reminders, and the LLM-callable `schedule_prompt` tool so pi can schedule future follow-ups like PR, CI, build, or deployment checks. Tasks run only while pi is active and idle, and scheduler state is persisted in shared pi storage using a workspace-mirrored path.

<!-- {/extensionsSchedulerOverview} -->

## Install

```bash
pi install npm:@monopi/extension-scheduler
```

<!-- {=extensionsSchedulerCommandsDocs} -->

Scheduler commands:

- `/remind in 45m <prompt>`: one-time reminder
- `/loop 5m <prompt>`: recurring check on an interval
- `/loop cron '*/5 * * * *' <prompt>`: recurring check on a cron schedule
- `/schedule`: show upcoming tasks
- `/schedule tui`: open the interactive schedule manager
- `/schedule list`: list all tasks
- `/schedule enable <id>` and `/schedule disable <id>`: enable or disable a task
- `/schedule delete <id>`: delete a task
- `/schedule clear`: clear all tasks
- `/schedule clear-other`: clear tasks created by other instances
- `/schedule adopt <id|all>`: take ownership of tasks from another instance
- `/schedule release <id|all>`: release ownership of tasks

The `schedule_prompt` tool lets the agent schedule follow-ups itself, including `continueUntilComplete` retries until a success marker appears.

<!-- {/extensionsSchedulerCommandsDocs} -->

## Ownership

<!-- {=extensionsSchedulerOwnershipDocs} -->

The scheduler distinguishes between instance-scoped tasks and workspace-scoped tasks. Instance scope is the default for `/loop`, `/remind`, and `schedule_prompt`, which means tasks stay owned by one pi instance and other instances restore them for review instead of auto-running them. Workspace scope is an explicit opt-in for shared CI/build/deploy monitors that should survive instance changes in the same repository.

<!-- {/extensionsSchedulerOwnershipDocs} -->

## Attribution

This implementation is adapted from [`pi-scheduler`](https://github.com/manojlds/pi-scheduler) by @manojlds (MIT). The scheduler API surface in this package is built on pi's `schedule_prompt` tooling.
