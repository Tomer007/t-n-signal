# T&N Signal v2.1 — Targeted Bug Fixes

## Scope
Surgical fixes for 7 confirmed bugs in the MOS report (May 16, 2026).
This is NOT the full v2.0 rebuild — it patches the current generation pipeline in place.

## Confirmed bugs (with real data for regression tests)

1. CRITICAL: HOLD verdict coexists with Graham AVOID, no reconciliation.
2. CRITICAL: 5-yr EPS growth shows "-39.377% (from $10.06 in 2022 to
   $0.55 in 2024)". Correct value: $10.06 -> $0.55 is -94.5%. Also the
   window ignores 2025 EPS recovery to $1.70.
3. CRITICAL: Dividend yield shown as 3.88% (Key Metrics) AND 4.04%
   (Graham section) in the same report.
4. HIGH: Three different EPS values in one report: $0.14 (TTM),
   $0.55 (2024), $10.06 (2022) used interchangeably without labels.
5. HIGH: Negative free cash flow (-$289.79M) appears in the long report
   but is missing from the card/summary report.
6. HIGH: Graham grading non-deterministic — 3/7 graded "C" in v2,
   "D" in v1.
7. MEDIUM: Entry Target = "$21.76, current price near 52-week low" —
   a raw price, not a derived target.

## Verified reference data for MOS (for regression tests)

- EPS annual: 2021=$4.27, 2022=$10.06, 2023=$3.50, 2024=$0.55, 2025=$1.70
- EPS TTM: $0.14
- Dividend: $0.88/share, yield ~3.8%
- Free cash flow TTM: -$289.79M
- Current price: ~$21.76, 52-week range $21.17-$38.23
