/**
 * Report Validator v2.1 — Enhanced validation with MOS-specific checks.
 *
 * Extends the base reportValidator with additional checks for:
 * - Duplicate metric values (bug #3)
 * - EPS growth recomputation (bug #2)
 * - Entry target methodology validation (bug #7)
 * - Verdict reconciliation requirement (bug #1)
 * - FCF presence in card report (bug #5)
 *
 * This is a SUPERSET of the base validator — it runs all base checks
 * plus the new v2.1 checks.
 */

import { validateReport, type ValidationResult, type Issue, type ReportForValidation } from './reportValidator';
import type { CanonicalMetrics, EpsGrowthResult } from './canonicalMetrics';
import { verdictsRequireReconciliation } from './reconciliation';

// ═══════════════════════════════════════════════════════════════
// Extended Report Structure
// ═══════════════════════════════════════════════════════════════

export interface ReportForValidationV21 extends ReportForValidation {
  // v2.1 additions
  canonicalMetrics?: CanonicalMetrics;
  reportedDividendYields?: number[];  // All dividend yield values found in report
  reportedEpsValues?: Array<{ value: number; label?: string }>;
  reportedEpsGrowth?: { percent: number; startYear: string; endYear: string } | null;
  entryTarget?: string;
  hasFreeCashFlow?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// V2.1 Validation
// ═══════════════════════════════════════════════════════════════

/**
 * Run all base validations PLUS v2.1 MOS-specific checks.
 */
export function validateReportV21(report: ReportForValidationV21): ValidationResult {
  // Run base validation first
  const baseResult = validateReport(report);
  const issues: Issue[] = [...baseResult.issues];

  // ─── Bug #3: Duplicate Dividend Yield ───
  if (report.reportedDividendYields && report.reportedDividendYields.length > 1) {
    const unique = [...new Set(report.reportedDividendYields.map(y => y.toFixed(2)))];
    if (unique.length > 1) {
      issues.push({
        severity: 'CRITICAL',
        message: `Multiple different dividend yield values in report: ${unique.map(y => y + '%').join(', ')}. Must use ONE canonical value.`,
        section: 'Dividend Yield',
      });
    }
  }

  // ─── Bug #2: EPS Growth Recomputation ───
  if (report.reportedEpsGrowth && report.canonicalMetrics?.epsGrowth5y) {
    const reported = report.reportedEpsGrowth.percent;
    const canonical = report.canonicalMetrics.epsGrowth5y.growthPercent;
    const diff = Math.abs(reported - canonical);

    // If reported growth differs from canonical by more than 5 percentage points
    if (diff > 5) {
      issues.push({
        severity: 'CRITICAL',
        message: `EPS growth mismatch: report shows ${reported.toFixed(1)}% but canonical computation is ${canonical.toFixed(1)}% ` +
          `(${report.canonicalMetrics.epsGrowth5y.startYear}→${report.canonicalMetrics.epsGrowth5y.endYear}). ` +
          `Difference: ${diff.toFixed(1)} percentage points.`,
        section: 'EPS Growth',
      });
    }
  }

  // ─── Bug #4: Unlabeled EPS Values ───
  if (report.reportedEpsValues && report.reportedEpsValues.length > 1) {
    const unlabeled = report.reportedEpsValues.filter(e => !e.label);
    if (unlabeled.length > 0) {
      issues.push({
        severity: 'HIGH',
        message: `${unlabeled.length} EPS value(s) used without labels. Each EPS must be labeled (TTM, FY2024, etc.) to avoid confusion.`,
        section: 'EPS Values',
      });
    }
  }

  // ─── Bug #1: Verdict Reconciliation ───
  if (report.verdict && report.grahamVerdict) {
    const needsReconciliation = verdictsRequireReconciliation(
      report.verdict as any,
      report.grahamVerdict as any
    );
    if (needsReconciliation && !report.hasReconciliation) {
      // This is already caught by base validator, but we add a more specific message
      const existing = issues.find(i => i.section === 'Verdict' && i.severity === 'CRITICAL');
      if (!existing) {
        issues.push({
          severity: 'CRITICAL',
          message: `Verdict "${report.verdict}" diverges from Graham "${report.grahamVerdict}" — Reconciliation section is REQUIRED.`,
          section: 'Verdict',
        });
      }
    }
  }

  // ─── Bug #5: FCF Missing from Card ───
  if (report.hasFreeCashFlow === false && report.canonicalMetrics?.freeCashFlowTTM !== null) {
    const fcf = report.canonicalMetrics?.freeCashFlowTTM;
    if (fcf !== undefined && fcf !== null && fcf < 0) {
      issues.push({
        severity: 'HIGH',
        message: `Negative free cash flow (${formatCurrency(fcf)}) is missing from the card/summary report. Critical risk signals must be visible in all report formats.`,
        section: 'Free Cash Flow',
      });
    }
  }

  // ─── Bug #7: Entry Target = Raw Price ───
  if (report.entryTarget && report.canonicalMetrics?.price) {
    const entryMatch = report.entryTarget.match(/\$?([\d,]+(?:\.\d+)?)/);
    if (entryMatch) {
      const entryValue = parseFloat(entryMatch[1].replace(/,/g, ''));
      const priceDiff = Math.abs(entryValue - report.canonicalMetrics.price) / report.canonicalMetrics.price;
      if (priceDiff < 0.02) {
        issues.push({
          severity: 'HIGH',
          message: `Entry target "$${entryValue.toFixed(2)}" is the current price ($${report.canonicalMetrics.price.toFixed(2)}), not a derived target. Must use a methodology (discount to consensus, margin of safety, multiple-based).`,
          section: 'Entry Target',
        });
      }
    }
  }

  return {
    passes: !issues.some(i => i.severity === 'CRITICAL'),
    issues,
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${abs.toFixed(2)}`;
}
