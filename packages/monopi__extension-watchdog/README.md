# @monopi/extension-watchdog

<!-- {=extensionsWatchdogConfigOverview} -->

The watchdog extension reads optional runtime protection settings from a JSON config file in the pi agent directory. That config controls whether sampling is enabled, how frequently samples run, and which CPU, memory, and event-loop thresholds trigger alerts or safe-mode escalation.

<!-- {/extensionsWatchdogConfigOverview} -->

## Install

```bash
pi install npm:@monopi/extension-watchdog
```

## Behavior

<!-- {=extensionsWatchdogAlertBehaviorDocs} -->

The watchdog samples CPU, memory, and event-loop lag on an interval, records recent samples and alerts, and can escalate into safe mode automatically when repeated alerts indicate sustained UI churn or lag. Toast notifications are intentionally capped per session; ongoing watchdog state is kept visible in the status bar and the `/watchdog` overlay instead of repeatedly spamming the terminal.

<!-- {/extensionsWatchdogAlertBehaviorDocs} -->

## Commands

- `/watchdog` and `/watchdog status`: show current watchdog state.
- `/watchdog startup`: show startup diagnostics.
- `/watchdog overlay` and `/watchdog dashboard`: open the detailed overlay.
- `/watchdog config`: show the effective config and thresholds.
- `/watchdog sample`: run a manual sample.
- `/watchdog blame`: attribute recent UI churn to active extensions.
- `/watchdog on` / `/watchdog off`: enable or disable sampling.
- `/watchdog reset`: clear recorded samples and alerts.
- `/safe-mode [on|off|status]`: control safe mode directly.

## Config file

<!-- {=extensionsWatchdogConfigPathDocs} -->

Path to the optional watchdog JSON config file under the pi agent directory. This is the default location used for watchdog sampling, threshold overrides, and enable/disable settings.

<!-- {/extensionsWatchdogConfigPathDocs} -->

The config file is optional. `loadWatchdogConfig` falls back to an empty config when the file is missing, invalid, or malformed, so runtime monitoring keeps working without it.
