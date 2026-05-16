/**
 * Tests for Deterministic Grade Scoring.
 *
 * Regression test for Bug #6: Non-deterministic grading.
 * Thresholds: >=0.90 A, >=0.75 B, >=0.60 C, >=0.45 D, else F
 */

import { describe, it, expect } from 'vitest';
import {
  gradeScore,
  gradeFromResults,
  verdictFromGrade,
} from '../gradeScore';

// ═══════════════════════════════════════════════════════════════
// Bug #6: Deterministic Grading — spec thresholds
// ═══════════════════════════════════════════════════════════════

describe('gradeScore — spec thresholds', () => {
  it('gradeScore(3,7) -> "F" (0.43)', () => {
    const result = gradeScore(3, 7);
    expect(result.grade).toBe('F');
    // 3/7 = 0.4286 < 0.45 → F
  });

  it('gradeScore(6,10) -> "C" (0.60) — NOT "B"', () => {
    const result = gradeScore(6, 10);
    expect(result.grade).toBe('C');
    // 6/10 = 0.60 >= 0.60 → C
  });

  it('gradeScore(9,17) -> "D" (0.53)', () => {
    const result = gradeScore(9, 17);
    expect(result.grade).toBe('D');
    // 9/17 = 0.529 >= 0.45 → D
  });

  it('REGRESSION: 3/7 always produces "F" (bug #6)', () => {
    // Run 100 times — must always be the same
    for (let i = 0; i < 100; i++) {
      expect(gradeScore(3, 7).grade).toBe('F');
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

  it('property: higher ratio never yields a lower-ranked letter', () => {
    const gradeRank: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
    for (let total = 1; total <= 20; total++) {
      let prevRank = 0;
      for (let pass = 0; pass <= total; pass++) {
        const grade = gradeScore(pass, total).grade;
        const rank = gradeRank[grade];
        expect(rank).toBeGreaterThanOrEqual(prevRank);
        prevRank = rank;
      }
    }
  });
});

describe('gradeScore — boundary cases', () => {
  // 90% boundary
  it('9/10 = A (0.90)', () => expect(gradeScore(9, 10).grade).toBe('A'));
  it('10/10 = A (1.00)', () => expect(gradeScore(10, 10).grade).toBe('A'));
  it('8/10 = B (0.80)', () => expect(gradeScore(8, 10).grade).toBe('B'));

  // 75% boundary
  it('75/100 = B', () => expect(gradeScore(75, 100).grade).toBe('B'));
  it('74/100 = C', () => expect(gradeScore(74, 100).grade).toBe('C'));

  // 60% boundary
  it('6/10 = C (0.60)', () => expect(gradeScore(6, 10).grade).toBe('C'));
  it('59/100 = D', () => expect(gradeScore(59, 100).grade).toBe('D'));

  // 45% boundary
  it('45/100 = D', () => expect(gradeScore(45, 100).grade).toBe('D'));
  it('44/100 = F', () => expect(gradeScore(44, 100).grade).toBe('F'));

  // Edge cases
  it('0/7 = F', () => expect(gradeScore(0, 7).grade).toBe('F'));
  it('7/7 = A', () => expect(gradeScore(7, 7).grade).toBe('A'));
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
    expect(result.grade).toBe('A');
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

    // 3 PASS out of 4 evaluated = 75% → B
    const result = gradeFromResults(results);
    expect(result.passCount).toBe(3);
    expect(result.totalCount).toBe(4);
    expect(result.grade).toBe('B');
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
  it('A → BUY', () => expect(verdictFromGrade('A')).toBe('BUY'));
  it('B → HOLD', () => expect(verdictFromGrade('B')).toBe('HOLD'));
  it('C → HOLD', () => expect(verdictFromGrade('C')).toBe('HOLD'));
  it('D → AVOID', () => expect(verdictFromGrade('D')).toBe('AVOID'));
  it('F → AVOID', () => expect(verdictFromGrade('F')).toBe('AVOID'));
});
