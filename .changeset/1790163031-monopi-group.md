---
monopi-group: patch
---

# Stop losing /route mode changes to the state debounce

The state flush added for /route lock and unlock missed /route on, off and shadow, which write through the same debounced state persistence. Running /route off and sending a prompt within the debounce window still routed the turn, and the next debounced write then reverted the mode on disk, discarding the change permanently. flushAdaptiveRoutingState is now called from every user-initiated state change.
