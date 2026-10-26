'use client'

import { useState, useCallback, useTransition } from 'react'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { QUIZ_QUESTIONS } from '@/src/lib/quiz/questions'
import type { QuizAnswer } from '@/src/lib/quiz/scoring'
import { getOptionImage } from '@/src/lib/quiz/imageSet'
import type { ImageSet } from '@/src/lib/quiz/imageSet'
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
    x: direction > 0 ? 300 : -300,
    opacity: 0,
    scale: 0.95,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -300 : 300,
    opacity: 0,
    scale: 0.95,
  }),
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.92 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
  tap: {
    scale: 0.96,
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

  // Display-only image-set preference
  // Lives ONLY in component state for the quiz session duration.
  // Never included in QuizAnswer[] or submitStyleQuiz. Never persisted to Supabase,
  // localStorage, or any analytics call.
  const [imageSet, setImageSet] = useState<ImageSet>('neutral')
  const [showIntro, setShowIntro] = useState(true)

  const handleIntroSelect = useCallback((selected: ImageSet) => {
    setImageSet(selected)
    setShowIntro(false)
  }, [])

  const question = QUIZ_QUESTIONS[currentStep]
  const progress = (currentStep / TOTAL_QUESTIONS) * 100

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
    <div className="stylegraph-quiz-surface relative flex w-full flex-col items-center text-white selection:bg-white/20">
      {/* Progress bar */}
      {!showIntro && (
        <div className="fixed top-0 left-0 z-50 h-1 w-full bg-white/5">
          <motion.div
            className="h-full bg-gradient-to-r from-white/60 to-white/90"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          />
        </div>
      )}

      {/* Step counter */}
      {!showIntro && (
        <div className="mt-14 mb-4 flex items-center gap-3">
          {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i < currentStep
                  ? 'w-8 bg-white/70'
                  : i === currentStep
                    ? 'w-8 bg-white'
                    : 'w-4 bg-white/15'
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
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mt-14 mb-0 text-xs font-semibold tracking-[0.2em] uppercase text-white/30"
          >
            StyleGraph Quiz
          </motion.p>
          <ImageSetIntroScreen onSelect={handleIntroSelect} />
        </div>
      ) : (
        /* Question area */
        <div className="flex w-full max-w-lg flex-1 flex-col items-center px-5 pb-10">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={question.id}
              custom={direction}
              variants={questionVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="flex w-full flex-col items-center"
            >
              {/* Prompt */}
              <h2 className="mt-4 mb-8 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
                {question.prompt}
              </h2>

              {/* Four answer cards in a two-column grid. */}
              <div className="grid w-full grid-cols-2 gap-3 sm:gap-4">
                {question.options.map((option, i) => {
                  const imageKey = `${question.id}:${option.id}`
                  const hasError = imgErrors.has(imageKey)
                  // Resolve the image URL via the display-only imageSet preference.
                  // getOptionImage is a pure function — it never stores imageSet anywhere.
                  const resolvedSrc = option.imageUrl
                    ? getOptionImage({ imageUrl: option.imageUrl }, imageSet, currentStep)
                    : option.images
                      ? getOptionImage({ images: option.images }, imageSet, currentStep + i)
                      : null
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
                      className="group relative flex aspect-[4/5] cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] shadow-lg outline-none transition-all duration-300 hover:border-white/20 hover:shadow-white/5 focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-40"
                      aria-label={option.label}
                      id={`quiz-option-${option.id}`}
                    >
                      {/* Image or gradient fallback */}
                      <div className="absolute inset-0">
                        {resolvedSrc && !hasError ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={resolvedSrc}
                            alt={option.label}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading={i < 2 ? 'eager' : 'lazy'}
                            onError={() => handleImageError(imageKey)}
                          />
                        ) : (
                          <div
                            className="h-full w-full transition-transform duration-500 group-hover:scale-105"
                            style={{ background: option.gradient }}
                          />
                        )}
                      </div>

                      {/* Bottom gradient overlay for text */}
                      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                      {/* Label */}
                      <span className="relative z-10 mt-auto px-3 pb-3 text-left text-sm font-medium tracking-wide text-white drop-shadow-lg sm:text-base">
                        {option.label}
                      </span>

                      {/* Hover ring */}
                      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-white/0 transition-all duration-300 group-hover:ring-2 group-hover:ring-white/30" />
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          </AnimatePresence>

          <p className="mt-5 text-sm text-white/60" aria-live="polite">Question {currentStep + 1} of {TOTAL_QUESTIONS}</p>
          {/* Submitting state */}
          {isPending && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 flex items-center gap-3 text-sm text-white/60"
            >
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
              Crafting your style DNA…
            </motion.div>
          )}
        </div>
      )}
    </div>
  )
}
