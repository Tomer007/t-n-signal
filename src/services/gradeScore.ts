/**
 * Deterministic Grade Scoring — fixed thresholds for Graham grading.
 *
 * FIX: Bug #6 — Graham grading non-deterministic (3/7 graded "C" in v2, "D" in v1).
 *
 * RULE: Given the same pass/total counts, the grade MUST always be the same.
 * No randomness, no floating-point edge cases, no model-dependent scoring.
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type GrahamGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F';

export interface GradeResult {
  grade: GrahamGrade;
  passCount: number;
  totalCount: number;
  passRate: number; // 0-1
  label: string;
}

// ═══════════════════════════════════════════════════════════════
// Fixed Thresholds (deterministic)
// ═══════════════════════════════════════════════════════════════

/**
 * Grade thresholds — FIXED, never changes.
 *
 * passRate = passCount / totalCount (ignoring UNKNOWN criteria)
 *
 * A+: 100% (all criteria pass)
 * A:  >= 85%
 * B+: >= 70%
 * B:  >= 55%
 * C:  >= 40%
 * D:  >= 25%
 * F:  < 25%
 */
const GRADE_THRESHOLDS: Array<{ minRate: number; grade: GrahamGrade; label: string }> = [
  { minRate: 1.00, grade: 'A+', label: 'Exceptional Value' },
  { minRate: 0.85, grade: 'A', label: 'Strong Value' },
  { minRate: 0.70, grade: 'B+', label: 'Good Value' },
  { minRate: 0.55, grade: 'B', label: 'Fair Value' },
  { minRate: 0.40, grade: 'C', label: 'Below Average' },
  { minRate: 0.25, grade: 'D', label: 'Poor Value' },
  { minRate: 0.00, grade: 'F', label: 'Fails Graham Criteria' },
];

// ═══════════════════════════════════════════════════════════════
// Grade Function
// ═══════════════════════════════════════════════════════════════

/**
 * Compute a deterministic Graham grade from pass/total counts.
 *
 * UNKNOWN criteria are excluded from the total (they don't count against).
 *
 * @param passCount - Number of criteria that PASS
 * @param totalCount - Total criteria evaluated (excluding UNKNOWN)
 */
export function gradeScore(passCount: number, totalCount: number): GradeResult {
  // Edge case: no criteria evaluated
  if (totalCount <= 0) {
    return {
      grade: 'F',
      passCount: 0,
      totalCount: 0,
      passRate: 0,
      label: 'Insufficient Data',
    };
  }

  // Clamp passCount to valid range
  const clampedPass = Math.max(0, Math.min(passCount, totalCount));
  const passRate = clampedPass / totalCount;

  // Find the grade — thresholds are sorted descending, first match wins
  for (const threshold of GRADE_THRESHOLDS) {
    if (passRate >= threshold.minRate) {
      return {
        grade: threshold.grade,
        passCount: clampedPass,
        totalCount,
        passRate,
        label: threshold.label,
      };
    }
  }

  // Should never reach here, but TypeScript needs it
  return {
    grade: 'F',
    passCount: clampedPass,
    totalCount,
    passRate,
    label: 'Fails Graham Criteria',
  };
}

/**
 * Compute grade from an array of criterion results.
 * Excludes UNKNOWN from the denominator.
 */
export function gradeFromResults(results: Array<{ result: 'PASS' | 'FAIL' | 'UNKNOWN' }>): GradeResult {
  const evaluated = results.filter(r => r.result !== 'UNKNOWN');
  const passCount = evaluated.filter(r => r.result === 'PASS').length;
  const totalCount = evaluated.length;
  return gradeScore(passCount, totalCount);
}

/**
 * Derive a Graham verdict from the grade.
 * Deterministic mapping — same grade always produces same verdict.
 */
export function verdictFromGrade(grade: GrahamGrade): 'BUY' | 'HOLD' | 'AVOID' {
  switch (grade) {
    case 'A+':
    case 'A':
      return 'BUY';
    case 'B+':
    case 'B':
      return 'HOLD';
    case 'C':
    case 'D':
    case 'F':
      return 'AVOID';
  }
}
