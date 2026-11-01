'use client'

import { useState, useCallback, useTransition } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { QUIZ_QUESTIONS } from '@/src/lib/quiz/questions'
import type { QuizAnswer } from '@/src/lib/quiz/scoring'
import { getOptionImage } from '@/src/lib/quiz/imageSet'
import type { QuizImagePreference } from '@/src/lib/quiz/imageSet'
import ImageSetIntroScreen from './ImageSetIntroScreen'
import { submitStyleQuiz } from './actions'

// ---------------------------------------------------------------------------
// Constants
// Five answer screens. The display-preference intro is not an answer.
// ---------------------------------------------------------------------------

const TOTAL_QUESTIONS = QUIZ_QUESTIONS.length

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const questionVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 240 : -240,
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -240 : 240,
    opacity: 0,
    scale: 0.98,
  }),
}

const reducedQuestionVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.35,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
  tap: {
    scale: 0.98,
    transition: { duration: 0.1 },
  },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StyleQuiz() {
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<QuizAnswer[]>([])
  const [direction, setDirection] = useState(1) // 1 = forward, -1 = back
  const [isPending, startTransition] = useTransition()
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set())
  const shouldReduceMotion = useReducedMotion()

  // Display-only image preference
  // Lives ONLY in component state for the quiz session duration.
  // Never included in QuizAnswer[] or submitStyleQuiz. Never persisted to Supabase,
  // localStorage, or any analytics call. Never infers user gender.
  const [imageSet, setImageSet] = useState<QuizImagePreference>('feminine')
  const [showIntro, setShowIntro] = useState(true)

  const handleIntroSelect = useCallback((selected: QuizImagePreference) => {
    setImageSet(selected)
    setShowIntro(false)
  }, [])

  const question = QUIZ_QUESTIONS[currentStep]
  const progress = ((currentStep + 1) / TOTAL_QUESTIONS) * 100

  const handleSelect = useCallback(
    (optionId: string) => {
      if (isPending) return

      const newAnswers: QuizAnswer[] = [
        ...answers,
        { questionId: question.id, optionId },
      ]
      setAnswers(newAnswers)

      if (currentStep < TOTAL_QUESTIONS - 1) {
        // Advance to next question
        setDirection(1)
        setCurrentStep((s) => s + 1)
      } else {
        // Last question: submit answer IDs for server-side scoring.
        startTransition(async () => {
          await submitStyleQuiz(newAnswers)
        })
      }
    },
    [answers, currentStep, isPending, question.id],
  )

  const handleImageError = useCallback((imageKey: string) => {
    setImgErrors((prev) => new Set(prev).add(imageKey))
  }, [])

  return (
    <div className="stylegraph-quiz-surface relative flex min-h-[100dvh] w-full flex-col items-center bg-[#141416] text-[#F5F1E9] selection:bg-[#E8C568]/20">
      {/* Progress bar */}
      {!showIntro && (
        <div
          className="fixed top-0 left-0 z-50 h-1 w-full bg-[#38383D]"
          role="progressbar"
          aria-valuenow={currentStep + 1}
          aria-valuemin={1}
          aria-valuemax={TOTAL_QUESTIONS}
          aria-label={`Question ${currentStep + 1} of ${TOTAL_QUESTIONS}`}
        >
          <motion.div
            className="h-full bg-[#E8C568]"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          />
        </div>
      )}

      {/* Step counter */}
      {!showIntro && (
        <div className="mt-8 mb-3 flex items-center gap-2 sm:mt-10" aria-hidden="true">
          {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? 'w-7 bg-[#E8C568]'
                  : i < currentStep
                    ? 'w-5 bg-[#E8C568]/60'
                    : 'w-3.5 bg-[#38383D]'
              }`}
            />
          ))}
        </div>
      )}

      {/* Intro screen */}
      {showIntro ? (
        <div className="flex w-full flex-1 flex-col items-center justify-center">
          {/* Brand wordmark while on intro */}
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mt-8 mb-2 text-xs font-medium tracking-[0.16em] uppercase text-[#B5B0A8]/80"
          >
            StyleGraph Quiz
          </motion.p>
          <ImageSetIntroScreen onSelect={handleIntroSelect} />
        </div>
      ) : (
        /* Question area */
        <div className="flex w-full max-w-lg flex-1 flex-col items-center px-4 sm:px-6 pb-12">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={question.id}
              custom={direction}
              variants={shouldReduceMotion ? reducedQuestionVariants : questionVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex w-full flex-col items-center"
            >
              {/* Prompt - Clear h1 with Wardrobe typography */}
              <h1 className="mt-2 mb-6 text-center text-2xl font-medium tracking-tight text-[#F5F1E9] sm:text-3xl sm:mb-8">
                {question.prompt}
              </h1>

              {/* Four answer cards in a two-column grid. */}
              <div className="grid w-full grid-cols-2 gap-3 sm:gap-4">
                {question.options.map((option, i) => {
                  const imageKey = `${question.id}:${option.id}`
                  const hasError = imgErrors.has(imageKey)
                  // Resolve the image URL via the display-only imageSet preference.
                  // getOptionImage is a pure function — it never stores imageSet anywhere.
                  const resolvedSrc = getOptionImage(option, imageSet, currentStep)
                  return (
                    <motion.button
                      key={option.id}
                      custom={i}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      whileTap="tap"
                      onClick={() => handleSelect(option.id)}
                      disabled={isPending}
                      className="group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-[#38383D] bg-[#1E1E21] p-2 text-left shadow-xs outline-none transition-all duration-200 hover:border-[#E8C568] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8C568] disabled:pointer-events-none disabled:opacity-40 sm:p-2.5"
                      aria-label={option.label}
                      id={`quiz-option-${option.id}`}
                    >
                      {/* Dedicated 4:5 image area */}
                      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-[#141416]">
                        {resolvedSrc && !hasError ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={resolvedSrc}
                            alt={option.label}
                            className="h-full w-full object-contain p-1.5 transition-transform duration-300 motion-safe:group-hover:scale-[1.03] sm:p-2"
                            loading={i < 2 ? 'eager' : 'lazy'}
                            onError={() => handleImageError(imageKey)}
                          />
                        ) : (
                          <div
                            className="flex h-full w-full flex-col items-center justify-center p-3 text-center"
                            aria-hidden="true"
                          >
                            <div className="flex size-10 items-center justify-center rounded-full border border-[#38383D] bg-[#1E1E21] text-[#B5B0A8] shadow-2xs">
                              <Sparkles className="size-5" strokeWidth={1.5} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Separate label area below the image */}
                      <div className="flex min-h-[2.5rem] w-full items-center px-1 pt-2 pb-0.5 sm:pt-2.5">
                        <span className="line-clamp-2 text-xs font-medium leading-snug text-[#F5F1E9] sm:text-sm">
                          {option.label}
                        </span>
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Question counter */}
          <p
            className="mt-6 text-xs font-medium tracking-wider uppercase text-[#B5B0A8] sm:text-sm"
            aria-live="polite"
          >
            Question {currentStep + 1} of {TOTAL_QUESTIONS}
          </p>

          {/* Submitting state */}
          {isPending && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 flex items-center gap-2.5 rounded-full border border-[#38383D] bg-[#1E1E21] px-4 py-2 text-xs font-medium text-[#F5F1E9] shadow-xs sm:text-sm"
              role="status"
              aria-live="polite"
            >
              <div className="size-3.5 animate-spin rounded-full border-2 border-[#38383D] border-t-[#E8C568]" />
              <span>Crafting your style DNA…</span>
            </motion.div>
          )}
        </div>
      )}
    </div>
  )
}
