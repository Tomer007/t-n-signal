import { describe, it, expect } from 'vitest';
import {
  getGrahamApplicability,
  GRAHAM_APPLICABILITY,
  type ApplicabilityLevel,
} from '../frameworkApplicability';

describe('GRAHAM_APPLICABILITY mapping', () => {
  it('maps industrials to high', () => {
    expect(GRAHAM_APPLICABILITY.industrials).toBe('high');
  });

  it('maps materials to high', () => {
    expect(GRAHAM_APPLICABILITY.materials).toBe('high');
  });

  it('maps energy to high', () => {
    expect(GRAHAM_APPLICABILITY.energy).toBe('high');
  });

  it('maps utilities to high', () => {
    expect(GRAHAM_APPLICABILITY.utilities).toBe('high');
  });

  it('maps technology to low', () => {
    expect(GRAHAM_APPLICABILITY.technology).toBe('low');
  });

  it('maps biotech to low', () => {
    expect(GRAHAM_APPLICABILITY.biotech).toBe('low');
  });

  it('maps software to low', () => {
    expect(GRAHAM_APPLICABILITY.software).toBe('low');
  });

  it('maps semiconductors to low', () => {
    expect(GRAHAM_APPLICABILITY.semiconductors).toBe('low');
  });

  it('maps financials to custom', () => {
    expect(GRAHAM_APPLICABILITY.financials).toBe('custom');
  });

  it('maps reits to custom', () => {
    expect(GRAHAM_APPLICABILITY.reits).toBe('custom');
  });
});

describe('getGrahamApplicability', () => {
  describe('high applicability sectors', () => {
    it('returns high for "Industrials"', () => {
      const result = getGrahamApplicability('Industrials');
      expect(result.level).toBe('high');
      expect(result.verdictWeight).toBe(1.0);
      expect(result.disclaimer).toBe('');
    });

    it('returns high for "Energy"', () => {
      const result = getGrahamApplicability('Energy');
      expect(result.level).toBe('high');
    });

    it('returns high for "Consumer Staples"', () => {
      const result = getGrahamApplicability('Consumer Staples');
      expect(result.level).toBe('high');
    });

    it('returns high for "Utilities"', () => {
      const result = getGrahamApplicability('Utilities');
      expect(result.level).toBe('high');
    });
  });

  describe('low applicability sectors', () => {
    it('returns low for "Technology"', () => {
      const result = getGrahamApplicability('Technology');
      expect(result.level).toBe('low');
      expect(result.verdictWeight).toBe(0.3);
    });

    it('returns low for "Software"', () => {
      const result = getGrahamApplicability('Software');
      expect(result.level).toBe('low');
    });

    it('returns low for "Semiconductors"', () => {
      const result = getGrahamApplicability('Semiconductors');
      expect(result.level).toBe('low');
    });

    it('returns low for "Biotech"', () => {
      const result = getGrahamApplicability('Biotech');
      expect(result.level).toBe('low');
    });

    it('disclaimer explains asset-light limitation', () => {
      const result = getGrahamApplicability('Technology');
      expect(result.disclaimer).toContain('asset-light');
      expect(result.disclaimer).toContain('IP-heavy');
      expect(result.disclaimer).toContain('screening signal only');
      expect(result.disclaimer).toContain('not a definitive verdict');
    });

    it('disclaimer mentions Price-to-Book limitation', () => {
      const result = getGrahamApplicability('Software');
      expect(result.disclaimer).toContain('Price-to-Book');
    });

    it('disclaimer mentions intellectual property value', () => {
      const result = getGrahamApplicability('Biotech');
      expect(result.disclaimer).toContain('intellectual property');
    });
  });

  describe('custom applicability sectors', () => {
    it('returns custom for "Financials"', () => {
      const result = getGrahamApplicability('Financials');
      expect(result.level).toBe('custom');
      expect(result.verdictWeight).toBe(0.5);
    });

    it('returns custom for "REITs"', () => {
      const result = getGrahamApplicability('REITs');
      expect(result.level).toBe('custom');
    });

    it('returns custom for "Real Estate"', () => {
      const result = getGrahamApplicability('Real Estate');
      expect(result.level).toBe('custom');
    });

    it('disclaimer mentions sector-specific adjustments', () => {
      const result = getGrahamApplicability('Financials');
      expect(result.disclaimer).toContain('modified Graham criteria');
    });
  });

  describe('medium (default) for unlisted sectors', () => {
    it('returns medium for unknown sector', () => {
      const result = getGrahamApplicability('Space Exploration');
      expect(result.level).toBe('medium');
      expect(result.verdictWeight).toBe(0.7);
    });

    it('returns medium for empty string', () => {
      const result = getGrahamApplicability('');
      expect(result.level).toBe('medium');
    });

    it('medium disclaimer is non-empty', () => {
      const result = getGrahamApplicability('Unknown Sector');
      expect(result.disclaimer.length).toBeGreaterThan(0);
    });
  });

  describe('case insensitivity', () => {
    it('handles uppercase', () => {
      expect(getGrahamApplicability('TECHNOLOGY').level).toBe('low');
    });

    it('handles mixed case', () => {
      expect(getGrahamApplicability('Consumer Staples').level).toBe('high');
    });

    it('handles extra whitespace', () => {
      expect(getGrahamApplicability('  energy  ').level).toBe('high');
    });
  });

  describe('partial matching', () => {
    it('matches "Information Technology" to low via partial', () => {
      const result = getGrahamApplicability('Information Technology');
      expect(result.level).toBe('low');
    });

    it('matches "Financial Services" to custom via partial', () => {
      const result = getGrahamApplicability('Financial Services');
      expect(result.level).toBe('custom');
    });
  });

  describe('verdict weight values', () => {
    it('high = 1.0', () => {
      expect(getGrahamApplicability('Industrials').verdictWeight).toBe(1.0);
    });

    it('medium = 0.7', () => {
      expect(getGrahamApplicability('Unknown').verdictWeight).toBe(0.7);
    });

    it('low = 0.3', () => {
      expect(getGrahamApplicability('Technology').verdictWeight).toBe(0.3);
    });

    it('custom = 0.5', () => {
      expect(getGrahamApplicability('Financials').verdictWeight).toBe(0.5);
    });
  });
});
