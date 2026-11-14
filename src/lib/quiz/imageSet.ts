/**
 * imageSet.ts
 *
 * Display-only image-set preference for the style quiz.
 *
 * This module is intentionally free of React, Supabase, and any analytics.
 * The ImageSet value lives only in StyleQuiz component state and is never
 * persisted, never stored as "gender", and never included in QuizAnswer[].
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Active quiz image preference chosen by the user in the intro screen.
 * Strictly binary: 'feminine' ("Women’s looks") or 'masculine' ("Men’s looks").
 */
export type QuizImagePreference = 'masculine' | 'feminine';

/**
 * Which imagery variant the user prefers for outfit-photography questions.
 * 'neutral' is retained strictly for backwards compatibility with legacy tests/callers.
 */
export type ImageSet = QuizImagePreference | 'neutral';

/**
 * A quiz option that carries a single image URL.
 * Used for backwards compatibility or single-image assets.
 */
export interface SingleImageOption {
  imageUrl?: string | null;
  id?: string;
  label?: string;
}

export interface GenderedImageOption {
  images: {
    masculine: string | null;
    feminine: string | null;
  };
  id?: string;
  label?: string;
}

export type QuizOptionWithImages = SingleImageOption | GenderedImageOption;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isGenderedImageOption(
  option: unknown,
): option is GenderedImageOption {
  return (
    typeof option === 'object' &&
    option !== null &&
    'images' in option &&
    typeof (option as GenderedImageOption).images === 'object' &&
    (option as GenderedImageOption).images !== null
  );
}

export function isSingleImageOption(
  option: unknown,
): option is SingleImageOption {
  return (
    typeof option === 'object' &&
    option !== null &&
    'imageUrl' in option &&
    typeof (option as SingleImageOption).imageUrl === 'string'
  );
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Resolve the correct image URL for a quiz option given the current imageSet
 * and the (0-based) index of the question in the full question list.
 *
 * Rules:
 *   - GenderedImageOption + 'masculine' → images.masculine (or null if missing).
 *   - GenderedImageOption + 'feminine'  → images.feminine (or null if missing).
 *   - GenderedImageOption + 'neutral'   → deterministic alternation:
 *       even questionIndex → images.masculine (or null)
 *       odd  questionIndex → images.feminine (or null)
 *   - Never substitute an image from the opposite set when preferred is null.
 *   - SingleImageOption   → returns `imageUrl ?? null`.
 *
 * Pure function — no side effects, no hooks.
 * The neutral alternation depends only on `questionIndex` (no randomness)
 * so it is stable across re-renders.
 *
 * @param option        - The quiz option to resolve an image for.
 * @param imageSet      - The user's display preference.
 * @param questionIndex - 0-based index of the question in the quiz sequence.
 * @returns             The resolved image URL string, or null if unconfigured/missing.
 */
export function getOptionImage(
  option: SingleImageOption | GenderedImageOption,
  imageSet: ImageSet,
  questionIndex: number,
): string | null {
  if (isGenderedImageOption(option)) {
    const { masculine, feminine } = option.images;

    if (imageSet === 'masculine') {
      return masculine ?? null;
    }

    if (imageSet === 'feminine') {
      return feminine ?? null;
    }

    // 'neutral' — deterministic alternation by question index
    // Never substitute from the opposite set if the chosen slot is null.
    const chosen = questionIndex % 2 === 0 ? masculine : feminine;
    return chosen ?? null;
  }

  if (isSingleImageOption(option)) {
    return option.imageUrl ?? null;
  }

  return null;
}
