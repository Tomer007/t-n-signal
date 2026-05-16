/**
 * Report Validator — pre-publication quality gate.
 *
 * Catches contradictions, hallucinated sources, unit mismatches,
 * and generic risk language before a report is shown to users.
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface Issue {
  severity: Severity;
  message: string;
  section: string;
}

export interface ValidationResult {
  passes: boolean;
  issues: Issue[];
}

export function hasCritical(result: ValidationResult): boolean {
  return result.issues.some(i => i.severity === 'CRITICAL');
}

// ═══════════════════════════════════════════════════════════════
// Banned Sources
// ═══════════════════════════════════════════════════════════════

export const BANNED_SOURCES: string[] = [
  'yahoo entertainment',
  'in-house research',
  'strategic plan',
  'financial data',
  'reddit',
  'twitter',
];

// ═══════════════════════════════════════════════════════════════
// Report Structure (for validation)
// ═══════════════════════════════════════════════════════════════

export interface ReportForValidation {
  ticker: string;
  verdict: string;
  grahamVerdict?: string;
  priceTargets: string[];       // All price target values found in report
  sources: string[];            // All cited sources
  sections: string[];           // Section names present
  swotThreats: string[];        // SWOT threat items
  quantitativeClaims: Array<{ claim: string; citation: string | null; isCalculated: boolean }>;
  calculations: Array<{ leftField: string; rightField: string; leftUnit: string; rightUnit: string }>;
  hasReconciliation: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Validation Logic
// ═══════════════════════════════════════════════════════════════

export function validateReport(report: ReportForValidation): ValidationResult {
  const issues: Issue[] = [];

  // CRITICAL: Multiple distinct price targets
  const uniqueTargets = [...new Set(report.priceTargets.filter(t => t && t !== 'UNKNOWN'))];
  if (uniqueTargets.length > 2) {
    issues.push({
      severity: 'CRITICAL',
      message: `Multiple distinct price targets found: ${uniqueTargets.join(', ')}. A report must have exactly ONE entry and ONE exit target.`,
      section: 'Price Targets',
    });
  }

  // CRITICAL: Diverging verdicts with no Reconciliation
  if (report.grahamVerdict && report.verdict) {
    const mainVerdict = report.verdict.toUpperCase();
    const grahamVerdict = report.grahamVerdict.toUpperCase();
    const diverges = (
      (mainVerdict === 'BUY' && grahamVerdict === 'AVOID') ||
      (mainVerdict === 'HOLD' && grahamVerdict === 'AVOID') ||
      (mainVerdict === 'BUY' && grahamVerdict === 'SELL') ||
      (mainVerdict === 'SELL' && grahamVerdict === 'BUY')
    );
    if (diverges && !report.hasReconciliation) {
      issues.push({
        severity: 'CRITICAL',
        message: `Verdict "${mainVerdict}" contradicts Graham verdict "${grahamVerdict}" with no Reconciliation section. Add explicit reconciliation explaining why they differ.`,
        section: 'Verdict',
      });
    }
  }

  // CRITICAL: Unit-mismatched calculations
  for (const calc of report.calculations) {
    if (calc.leftUnit !== calc.rightUnit) {
      issues.push({
        severity: 'CRITICAL',
        message: `Unit mismatch in calculation: "${calc.leftField}" (${calc.leftUnit}) compared to "${calc.rightField}" (${calc.rightUnit}).`,
        section: 'Calculations',
      });
    }
  }

  // HIGH: Banned source cited
  for (const source of report.sources) {
    const lower = source.toLowerCase();
    for (const banned of BANNED_SOURCES) {
      if (lower.includes(banned)) {
        issues.push({
          severity: 'HIGH',
          message: `Banned source cited: "${source}". Remove or replace with a Tier 1-4 source.`,
          section: 'Sources',
        });
        break;
      }
    }
  }

  // MEDIUM: Quantitative claim with no citation and not marked calculated
  for (const claim of report.quantitativeClaims) {
    if (!claim.citation && !claim.isCalculated) {
      issues.push({
        severity: 'MEDIUM',
        message: `Unsourced quantitative claim: "${claim.claim}". Add a citation or mark as [Calculated].`,
        section: 'Claims',
      });
    }
  }

  // MEDIUM: Generic SWOT threats
  const genericTerms = ['unnamed', 'various', 'industry-wide'];
  for (const threat of report.swotThreats) {
    const lower = threat.toLowerCase();
    for (const term of genericTerms) {
      if (lower.includes(term)) {
        issues.push({
          severity: 'MEDIUM',
          message: `Generic SWOT threat: "${threat}". Name specific entities, dates, and quantitative impacts.`,
          section: 'SWOT',
        });
        break;
      }
    }
  }

  return {
    passes: !issues.some(i => i.severity === 'CRITICAL'),
    issues,
  };
}
