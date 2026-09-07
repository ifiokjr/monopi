---
monopi-group: patch
---

# Trim trailing zeros from usage percentages

Follow-up to the percentage precision fixes: usage-tracker percentages render with **at most** two decimal places — values that need fewer are shown without padding (`50% used`, `16.7% left`, `33.33% used`). Trailing zeros are trimmed, so nothing is ever rendered beyond two decimals, and clean values stay clean.