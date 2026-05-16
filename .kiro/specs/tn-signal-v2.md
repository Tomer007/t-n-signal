# T&N Signal v2.0 — Research Quality Overhaul

## Goal
Transform T&N Signal from "looks like research" to "is trustworthy research."

## Known bugs to fix (regression anchors)

1. Triple price target in one report (TSLA: $525/$500/$480)
2. HOLD verdict + AVOID Graham score in same report, no reconciliation
3. Unit-mismatch bug (MOS: compared $5.76B total debt to $38.07/share book value)
4. Hallucinated citations ("10-K p.66", "In-house Research", "Strategic Plan")
5. Unsourced price targets ($300 exit target from nowhere)
6. Generic SWOT ("unnamed industry peers")
7. Undefined "Confidence %"
8. Sentiment gauge label/direction mismatch
9. "Entry Target = 52-week low" anti-pattern

## Pipeline (target architecture)

```
Ticker → Verified Data → Locked Thesis → Section Generation → Validation → Bear-Case Retrieval → Final Assembly
```

### Stage 1: Data Collection
- Yahoo Finance (quote, summary, history)
- FMP (income statements, balance sheet, ratios)
- SEC EDGAR (10-year EPS/revenue from XBRL)
- Finnhub (insider transactions, social sentiment)
- FRED (AAA bond yield, macro rates)
- News APIs (GNews, NewsAPI, Yahoo fallback)

### Stage 2: Locked Thesis (Pass 1)
- Generate core thesis + price targets in ~500 tokens
- Price targets MUST derive from analyst consensus or explicit multiple
- Lock these values for all subsequent sections

### Stage 3: Section Generation (Pass 2)
- Each section receives Pass 1 output as immutable context
- Sections cannot generate new price targets
- All numbers must reference `<verified_data>` block

### Stage 4: Validation Pass
- Check for internal contradictions
- Verify all numeric claims exist in source data
- Flag unsourced assertions
- Ensure verdict consistency (short report ↔ Graham)

### Stage 5: Bear-Case Retrieval
- Search for disconfirming evidence (negative news, short reports)
- Inject as `<disconfirming_evidence>` 
- Require steel-man to engage with 3+ specific items

### Stage 6: Final Assembly
- Reconcile verdicts if they differ
- Add framework limitation notes (IP-heavy, financial, REIT)
- Generate confidence score from data completeness

## Fixes Already Implemented (v1.0.0 → current)

| # | Issue | Status |
|---|-------|--------|
| 1 | Price targets from verified data only | ✅ Fixed (analyst consensus) |
| 2 | Graham reconciliation note | ✅ Fixed (IP-heavy disclaimer) |
| 4 | Anti-hallucination rules | ✅ Fixed (verified_data block) |
| 5 | Justified price targets | ✅ Fixed (must show multiple) |
| 6 | Specific SWOT threats | ✅ Fixed (prompt requires named threats) |
| 7 | Confidence % defined | ✅ Fixed (data completeness metric) |
| 8 | Risk gauge label | ✅ Fixed (Low/Moderate/High) |
| 9 | Entry from analyst target low | ✅ Fixed |

## Remaining Work (v2.0)

| # | Task | Priority |
|---|------|----------|
| A | Multi-pass architecture (locked thesis) | High |
| B | Contradiction-check validation pass | High |
| C | Bear-case retrieval (negative news search) | Medium |
| D | Unit-mismatch detection ($/share vs $B) | Medium |
| E | Backtesting / accountability tracking | Low |
| F | Ticker-type specialization (bank vs tech vs REIT) | Low |

## Data Sources

| Source | Key Required | Coverage |
|--------|-------------|----------|
| Yahoo Finance | No | Global equities, ETFs, indices |
| FMP | Yes (free tier) | US equities, limited coverage |
| SEC EDGAR | No | All US-listed (10-K/10-Q XBRL) |
| Finnhub | Yes (free tier) | US equities, insider data |
| FRED | Yes (free) | Macro/economic data |
| GNews | Yes (free tier) | Global news |
| NewsAPI | Yes (free tier) | Global news |
