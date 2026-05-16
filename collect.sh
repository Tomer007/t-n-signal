#!/usr/bin/env bash
# collect.sh — bundle T&N Signal source files for review
# Run from the repo root: bash collect.sh

set -euo pipefail

OUT="tn-signal-review-bundle.txt"
> "$OUT"   # truncate / create

# Files most relevant to the 9 bugs, in priority order.
FILES=(
  # --- core fix architecture ---
  "src/services/canonicalMetrics.ts"
  "src/services/gradeScore.ts"
  "src/services/reconciliation.ts"
  "src/services/reportValidator.ts"
  "src/services/reportValidatorV21.ts"
  "src/services/reportPipeline.ts"
  "src/services/calculationValidator.ts"
  "src/services/cardReportEnricher.ts"
  "src/services/frameworkApplicability.ts"
  "src/services/thesisGenerator.ts"
  "src/services/market_data.ts"
  "src/utils/formatNumber.ts"

  # --- the live generation path (is the fix code wired in?) ---
  "src/lib/ai.ts"
  "src/lib/costs.ts"
  "server.ts"
  "src/App.tsx"

  # --- prompts ---
  "src/prompts/systemPromptV2.ts"
  "src/prompts/thesisPromptV2.ts"
  "src/prompts/bearCasePromptV2.ts"

  # --- types ---
  "src/types/index.ts"

  # --- specs ---
  ".kiro/specs/tn-signal-v2.md"
  ".kiro/specs/tn-signal-v2.1-fixes.md"
)

for f in "${FILES[@]}"; do
  {
    echo "==================== FILE: $f ===================="
    if [[ -f "$f" ]]; then
      cat "$f"
    else
      echo "[MISSING — file not found]"
    fi
    echo ""
    echo ""
  } >> "$OUT"
done

# quick summary to the terminal
echo "Done. Bundled ${#FILES[@]} files into: $OUT"
echo "Size: $(wc -c < "$OUT") bytes, $(wc -l < "$OUT") lines"
echo ""
echo "Next: open $OUT, copy its contents, and paste into the chat."
