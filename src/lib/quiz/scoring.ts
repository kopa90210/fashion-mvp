/**
 * Deterministic style-quiz scoring engine.
 *
 * Pure function — no React, no Supabase, no LLM.
 * Takes an array of answers + the question bank and returns a
 * normalised StyleVector with every dimension in [0, 1].
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A style vector maps dimension names to weights ∈ [0, 1]. */
export type StyleVector = Record<string, number>;

/** One answer: which option the user picked for a given question. */
export interface QuizAnswer {
  questionId: string;
  optionId: string;
}

/** An individual option within a question. */
export interface QuizOption {
  id: string;
  imageUrl?: string;
  label: string;
  /** Partial weight map — only dimensions this option contributes to. */
  weights: Partial<StyleVector>;
}

/** A single quiz question. */
export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
}

// ---------------------------------------------------------------------------
// All style dimensions the quiz can produce.
// ---------------------------------------------------------------------------

export const STYLE_DIMENSIONS = [
  'minimal',
  'casual',
  'smart_casual',
  'streetwear',
  'classic',
  'old_money',
  'sporty',
  'relaxed',
  'vintage',
  'trend_forward',
  'formal',
  'edgy',
] as const;

export type StyleDimension = (typeof STYLE_DIMENSIONS)[number];

export interface QuizSignals {
  primaryOccasion: 'work-university' | 'everyday-errands' | 'going-out' | 'mixed';
  style: 'minimal' | 'classic' | 'relaxed' | 'streetwear';
  fit: 'slim' | 'regular' | 'relaxed' | 'oversized';
  formality: 'casual' | 'put-together' | 'polished' | 'formal';
  exploration: 'familiar' | 'small-twist' | 'mix-it-up' | 'bold';
}

const SIGNAL_QUESTIONS = {
  'primary-occasion': 'primaryOccasion',
  'personal-style': 'style',
  'preferred-fit': 'fit',
  'preferred-formality': 'formality',
  'exploration-level': 'exploration',
} as const;

/** Reject duplicate, missing, and unknown answers before deriving saved state. */
export function parseQuizSignals(answers: unknown, questions: QuizQuestion[]): QuizSignals {
  if (!Array.isArray(answers) || answers.length !== 5 || questions.length !== 5) {
    throw new Error('Answer all five questions');
  }
  const result: Record<string, string> = {};
  for (const question of questions) {
    if (!(question.id in SIGNAL_QUESTIONS) || question.options.length !== 4) throw new Error('Invalid quiz configuration');
    const matches = answers.filter((answer) => answer?.questionId === question.id);
    if (matches.length !== 1 || !question.options.some((option) => option.id === matches[0].optionId)) {
      throw new Error('Invalid quiz answer');
    }
    result[SIGNAL_QUESTIONS[question.id as keyof typeof SIGNAL_QUESTIONS]] = matches[0].optionId;
  }
  return result as unknown as QuizSignals;
}

/** Legacy users have no quiz_signals; retain their existing vector ranking. */
export function readQuizSignals(value: unknown): QuizSignals | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const valid: Record<keyof QuizSignals, string[]> = {
    primaryOccasion: ['work-university', 'everyday-errands', 'going-out', 'mixed'],
    style: ['minimal', 'classic', 'relaxed', 'streetwear'],
    fit: ['slim', 'regular', 'relaxed', 'oversized'],
    formality: ['casual', 'put-together', 'polished', 'formal'],
    exploration: ['familiar', 'small-twist', 'mix-it-up', 'bold'],
  };
  if (Object.entries(valid).some(([key, options]) => !options.includes(record[key] as string))) return null;
  return value as QuizSignals;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Compute a style vector from the user's quiz answers.
 *
 * Algorithm:
 *   1. For each answered question find the selected option.
 *   2. Collect non-empty style weight maps.
 *   3. Average each dimension over style-bearing answers, so other signals do not dilute style.
 *   4. Clamp to [0, 1], round to 2 dp.
 *
 * @returns A full StyleVector with every dimension present.
 */
export function computeStyleVector(
  answers: QuizAnswer[],
  questions: QuizQuestion[],
): StyleVector {
  if (answers.length === 0) {
    return Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, 0]));
  }

  // Build a lookup: questionId → QuizQuestion
  const questionMap = new Map<string, QuizQuestion>(
    questions.map((q) => [q.id, q]),
  );

  // Collect the weight maps for each answered question.
  const selectedWeights: Partial<StyleVector>[] = [];

  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    if (!question) continue;

    const option = question.options.find((o) => o.id === answer.optionId);
    if (!option) continue;

    if (Object.keys(option.weights).length > 0) selectedWeights.push(option.weights);
  }

  if (selectedWeights.length === 0) {
    return Object.fromEntries(STYLE_DIMENSIONS.map((d) => [d, 0]));
  }

  const count = selectedWeights.length;

  const vector: StyleVector = {};
  for (const dim of STYLE_DIMENSIONS) {
    const sum = selectedWeights.reduce(
      (acc, w) => acc + (w[dim] ?? 0),
      0,
    );
    const avg = sum / count;
    // Clamp [0, 1] and round to 2 decimal places.
    vector[dim] = Math.round(Math.min(1, Math.max(0, avg)) * 100) / 100;
  }

  return vector;
}

// ---------------------------------------------------------------------------
// Quiz metadata (non-style signals)
// ---------------------------------------------------------------------------

/**
 * The user's primary shopping motivation, as selected in Q8.
 * Mirrors the option IDs used in the question bank — no DB persistence yet.
 *
 * TODO: persist shoppingMotivation + riskTolerance to Supabase once the
 * schema is extended (fashion_dna jsonb can hold them as metadata fields).
 */
export type ShoppingMotivation =
  | 'matches-wardrobe'
  | 'looks-unique'
  | 'trending'
  | 'fits-perfectly'
  | 'quality-worth-it'
  | 'price-is-right';

/**
 * How adventurous the user is with outfit choices, as selected in Q9.
 */
export type RiskTolerance =
  | 'safe-combinations'
  | 'sometimes-different'
  | 'love-experimenting'
  | 'depends-on-mood';

/**
 * Extract non-style metadata signals from the raw answer list.
 *
 * Q8 (shopping-behavior) and Q9 (outfit-risk) carry empty weights and do
 * not feed the style vector. Their optionId IS the semantic value, so we
 * can extract it directly without looking up the question bank.
 *
 * Returns undefined fields when those questions were not answered.
 */
export function extractQuizMetadata(
  answers: QuizAnswer[],
): { shoppingMotivation?: ShoppingMotivation; riskTolerance?: RiskTolerance } {
  const shoppingAnswer = answers.find(
    (a) => a.questionId === 'shopping-behavior',
  );
  const riskAnswer = answers.find((a) => a.questionId === 'outfit-risk');

  return {
    shoppingMotivation: shoppingAnswer?.optionId as ShoppingMotivation | undefined,
    riskTolerance: riskAnswer?.optionId as RiskTolerance | undefined,
  };
}
