/**
 * Framework Applicability — determines how well Graham's framework
 * applies to a given sector.
 *
 * Graham's criteria were designed for industrial/asset-heavy companies.
 * For asset-light businesses (tech, SaaS, biotech), the framework
 * systematically penalizes them on Price-to-Book and Net Current Asset
 * Value criteria. This module quantifies that limitation.
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type ApplicabilityLevel = 'high' | 'medium' | 'low' | 'custom';

export interface GrahamApplicabilityResult {
  level: ApplicabilityLevel;
  disclaimer: string;
  verdictWeight: number;
}

// ═══════════════════════════════════════════════════════════════
// Sector → Applicability Mapping
// ═══════════════════════════════════════════════════════════════

export const GRAHAM_APPLICABILITY: Record<string, ApplicabilityLevel> = {
  // HIGH — asset-heavy, Graham's framework fits well
  industrials: 'high',
  materials: 'high',
  energy: 'high',
  'consumer staples': 'high',
  consumerstaples: 'high',
  utilities: 'high',
  'basic materials': 'high',
  mining: 'high',
  manufacturing: 'high',
  construction: 'high',
  transportation: 'high',

  // LOW — asset-light / IP-heavy, framework systematically penalizes
  technology: 'low',
  biotech: 'low',
  biotechnology: 'low',
  software: 'low',
  'information technology': 'low',
  saas: 'low',
  semiconductors: 'low',
  'internet services': 'low',
  'digital media': 'low',
  pharmaceuticals: 'low',

  // CUSTOM — requires modified criteria
  financials: 'custom',
  'financial services': 'custom',
  banking: 'custom',
  insurance: 'custom',
  reits: 'custom',
  'real estate': 'custom',
  'real estate investment trust': 'custom',
};

// ═══════════════════════════════════════════════════════════════
// Disclaimers
// ═══════════════════════════════════════════════════════════════

const DISCLAIMERS: Record<ApplicabilityLevel, string> = {
  high: '',
  medium: 'Graham\'s framework has moderate applicability to this sector. Some criteria (particularly Price-to-Book) may not fully capture the company\'s value drivers.',
  low: '⚠️ Graham\'s asset-based framework systematically penalizes asset-light and IP-heavy businesses. Price-to-Book, Net Current Asset Value, and Tangible Book criteria are structurally unfavorable for this sector. This result is a screening signal only — not a definitive verdict. Companies in this sector typically derive value from intellectual property, recurring revenue, and network effects rather than tangible assets.',
  custom: '⚠️ This sector requires modified Graham criteria. Standard metrics like Debt-to-Equity and Book Value have different interpretations for financial institutions and REITs. Results should be interpreted with sector-specific adjustments.',
};

const VERDICT_WEIGHTS: Record<ApplicabilityLevel, number> = {
  high: 1.0,
  medium: 0.7,
  low: 0.3,
  custom: 0.5,
};

// ═══════════════════════════════════════════════════════════════
// Main Function
// ═══════════════════════════════════════════════════════════════

/**
 * Determine how applicable Graham's framework is for a given sector.
 * Returns the applicability level, a disclaimer string, and a weight
 * for how much the Graham verdict should influence the final recommendation.
 */
export function getGrahamApplicability(sector: string): GrahamApplicabilityResult {
  const normalized = sector.toLowerCase().trim();

  // Empty or very short input → default to medium
  if (normalized.length < 3) {
    return { level: 'medium', disclaimer: DISCLAIMERS.medium, verdictWeight: VERDICT_WEIGHTS.medium };
  }

  // Try exact match first
  let level = GRAHAM_APPLICABILITY[normalized];

  // Try partial match if no exact match
  if (!level) {
    for (const [key, val] of Object.entries(GRAHAM_APPLICABILITY)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        level = val;
        break;
      }
    }
  }

  // Default to medium for unlisted sectors
  if (!level) {
    level = 'medium';
  }

  return {
    level,
    disclaimer: DISCLAIMERS[level],
    verdictWeight: VERDICT_WEIGHTS[level],
  };
}
