---
monopi-group: patch
---

# Cap usage percentage precision to one decimal

The usage-tracker widget interpolated the consumed quota percentage into the status line as a raw float, so provider values like `33.32999999999999% used` could render with a dozen decimal places. Percentages in the widget line and the `/usage` dashboard rate-limit rows now display with at most one decimal place (`33.3% used`, `67% left`), matching the precision providers actually report.