---
monopi-group: patch
---

# Render usage percentages with two fixed decimal places

Follow-up to the percentage precision fix: usage-tracker percentages now always render with exactly two decimal places (`50.00% used`, `75.00% left`) instead of the variable one-decimal formatting, so the number of decimals is fixed and float noise can never leak through.