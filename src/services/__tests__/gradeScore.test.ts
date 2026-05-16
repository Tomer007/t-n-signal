/**
 * Tests for Deterministic Grade Scoring.
 *
 * Regression test for Bug #6: Non-deterministic grading.
 */

import { describe, it, expect } from 'vitest';
import {
  gradeScore,
  gradeFromResults,
  verdictFromGrade,
  type GradeResult,
} from '../gradeScore';

// ═══════════════════════════════════════════════════════════════
// Bug #6: Deterministic Grading
// ═══════════════════════════════════════════════════════════════

describe('gradeScore — deterministic', () => {
  it('REGRESSION: 3/7 always produces grade "C" (bug #6)', () => {
    // Bug: 3/7 was graded "C" in v2 but "D" in v1
    // Fix: 3/7 = 42.9% → always "C" (threshold: >= 40%)
    const result = gradeScore(3, 7);
    expect(result.grade).toBe('C');
    expect(result.label).toBe('Below Average');

    // Run it 100 times — must always be the same
    for (let i = 0; i < 100; i++) {
      expect(gradeScore(3, 7).grade).toBe('C');
    }
  });

  it('same inputs always produce same output (deterministic)', () => {
    const testCases = [
      { pass: 0, total: 7 },
      { pass: 1, total: 7 },
      { pass: 2, total: 7 },
      { pass: 3, total: 7 },
      { pass: 4, total: 7 },
      { pass: 5, total: 7 },
      { pass: 6, total: 7 },
      { pass: 7, total: 7 },
    ];

    for (const tc of testCases) {
      const first = gradeScore(tc.pass, tc.total);
      for (let i = 0; i < 50; i++) {
        const repeat = gradeScore(tc.pass, tc.total);
        expect(repeat.grade).toBe(first.grade);
        expect(repeat.passRate).toBe(first.passRate);
      }
    }
  });
});

describe('gradeScore — thresholds', () => {
  it('7/7 = A+ (100%)', () => {
    expect(gradeScore(7, 7).grade).toBe('A+');
  });

  it('6/7 = A (85.7%)', () => {
    expect(gradeScore(6, 7).grade).toBe('A');
  });

  it('5/7 = B+ (71.4%)', () => {
    expect(gradeScore(5, 7).grade).toBe('B+');
  });

  it('4/7 = B (57.1%)', () => {
    expect(gradeScore(4, 7).grade).toBe('B');
  });

  it('3/7 = C (42.9%)', () => {
    expect(gradeScore(3, 7).grade).toBe('C');
  });

  it('2/7 = D (28.6%)', () => {
    expect(gradeScore(2, 7).grade).toBe('D');
  });

  it('1/7 = F (14.3%)', () => {
    expect(gradeScore(1, 7).grade).toBe('F');
  });

  it('0/7 = F (0%)', () => {
    expect(gradeScore(0, 7).grade).toBe('F');
  });

  // Edge cases with different totals
  it('10/10 = A+', () => {
    expect(gradeScore(10, 10).grade).toBe('A+');
  });

  it('9/10 = A (90%)', () => {
    expect(gradeScore(9, 10).grade).toBe('A');
  });

  it('7/10 = B+ (70%)', () => {
    expect(gradeScore(7, 10).grade).toBe('B+');
  });

  it('6/10 = B (60%)', () => {
    expect(gradeScore(6, 10).grade).toBe('B');
  });

  it('4/10 = C (40%)', () => {
    expect(gradeScore(4, 10).grade).toBe('C');
  });

  it('3/10 = D (30%)', () => {
    expect(gradeScore(3, 10).grade).toBe('D');
  });

  it('2/10 = F (20%)', () => {
    expect(gradeScore(2, 10).grade).toBe('F');
  });
});

describe('gradeScore — edge cases', () => {
  it('handles totalCount = 0', () => {
    const result = gradeScore(0, 0);
    expect(result.grade).toBe('F');
    expect(result.label).toBe('Insufficient Data');
  });

  it('clamps passCount to totalCount', () => {
    const result = gradeScore(10, 7);
    expect(result.passCount).toBe(7);
    expect(result.grade).toBe('A+');
  });

  it('clamps negative passCount to 0', () => {
    const result = gradeScore(-1, 7);
    expect(result.passCount).toBe(0);
    expect(result.grade).toBe('F');
  });
});

describe('gradeFromResults', () => {
  it('excludes UNKNOWN from denominator', () => {
    const results = [
      { result: 'PASS' as const },
      { result: 'PASS' as const },
      { result: 'PASS' as const },
      { result: 'FAIL' as const },
      { result: 'UNKNOWN' as const },
      { result: 'UNKNOWN' as const },
      { result: 'UNKNOWN' as const },
    ];

    // 3 PASS out of 4 evaluated (3 UNKNOWN excluded) = 75% → B+
    const result = gradeFromResults(results);
    expect(result.passCount).toBe(3);
    expect(result.totalCount).toBe(4);
    expect(result.grade).toBe('B+');
  });

  it('all UNKNOWN returns F with Insufficient Data', () => {
    const results = [
      { result: 'UNKNOWN' as const },
      { result: 'UNKNOWN' as const },
    ];
    const result = gradeFromResults(results);
    expect(result.grade).toBe('F');
    expect(result.label).toBe('Insufficient Data');
  });
});

describe('verdictFromGrade', () => {
  it('A+ → BUY', () => expect(verdictFromGrade('A+')).toBe('BUY'));
  it('A → BUY', () => expect(verdictFromGrade('A')).toBe('BUY'));
  it('B+ → HOLD', () => expect(verdictFromGrade('B+')).toBe('HOLD'));
  it('B → HOLD', () => expect(verdictFromGrade('B')).toBe('HOLD'));
  it('C → AVOID', () => expect(verdictFromGrade('C')).toBe('AVOID'));
  it('D → AVOID', () => expect(verdictFromGrade('D')).toBe('AVOID'));
  it('F → AVOID', () => expect(verdictFromGrade('F')).toBe('AVOID'));
});
