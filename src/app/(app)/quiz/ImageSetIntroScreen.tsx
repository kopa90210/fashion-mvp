'use client'

import { useState, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import type { QuizImagePreference } from '@/src/lib/quiz/imageSet'

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  },
}

const reducedItemVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
}

// ---------------------------------------------------------------------------
// Card definitions
// ---------------------------------------------------------------------------

interface IntroChoice {
  key: QuizImagePreference
  label: string
  imageSrc: string
}

const CHOICES: IntroChoice[] = [
  {
    key: 'feminine',
    label: "Women’s looks",
    imageSrc: '/quiz/q1-classic-f.jpg',
  },
  {
    key: 'masculine',
    label: "Men’s looks",
    imageSrc: '/quiz/q1-classic-m.jpg',
  },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ImageSetIntroScreenProps {
  /** Called when the user picks Women’s looks or Men’s looks */
  onSelect: (preference: QuizImagePreference) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Lead-in screen shown before Question 1.
 *
 * - Presents two photographic cards: "Women’s looks" and "Men’s looks".
 * - Selecting a card sets display-only image preference and advances to Q1.
 * - Display-only: never submitted to backend, never infers user gender,
 *   and never alters style scoring or recommendation vectors.
 */
export default function ImageSetIntroScreen({ onSelect }: ImageSetIntroScreenProps) {
  const shouldReduceMotion = useReducedMotion()
  const [imgErrors, setImgErrors] = useState<Set<QuizImagePreference>>(new Set())

  const handleImageError = useCallback((key: QuizImagePreference) => {
    setImgErrors((prev) => new Set(prev).add(key))
  }, [])

  const activeItemVariants = shouldReduceMotion ? reducedItemVariants : itemVariants

  return (
    <motion.div
      className="flex w-full max-w-lg flex-col items-center px-4 pb-12 sm:px-6"
      variants={shouldReduceMotion ? undefined : containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Heading */}
      <motion.div variants={activeItemVariants} className="mt-2 mb-2 text-center">
        <h1 className="text-2xl font-medium tracking-tight text-[#F5F1E9] sm:text-3xl">
          Which looks would you like to see?
        </h1>
      </motion.div>

      {/* Supporting text */}
      <motion.p
        variants={activeItemVariants}
        className="mb-8 max-w-sm text-center text-sm leading-relaxed text-[#B5B0A8]"
      >
        Choose the photos you prefer. Your answers shape your recommendations.
      </motion.p>

      {/* Two photographic cards */}
      <motion.div
        variants={activeItemVariants}
        className="grid w-full grid-cols-2 gap-3.5 sm:gap-4"
        role="group"
        aria-label="Image preference choices"
      >
        {CHOICES.map((choice) => {
          const hasError = imgErrors.has(choice.key)

          return (
            <motion.button
              key={choice.key}
              type="button"
              onClick={() => onSelect(choice.key)}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
              className="group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-[#38383D] bg-[#1E1E21] p-2 text-left shadow-xs outline-none transition-all duration-200 hover:border-[#E8C568] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8C568] sm:p-2.5"
              id={`intro-card-${choice.key}`}
              aria-label={choice.label}
            >
              {/* Dedicated 4:5 image area */}
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-[#141416]">
                {!hasError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={choice.imageSrc}
                    alt={choice.label}
                    className="h-full w-full object-contain p-1.5 transition-transform duration-300 motion-safe:group-hover:scale-[1.03] sm:p-2"
                    loading="eager"
                    onError={() => handleImageError(choice.key)}
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

              {/* Dedicated label area below the image */}
              <div className="flex min-h-[2.5rem] w-full items-center justify-between px-1 pt-2 pb-0.5 sm:pt-2.5">
                <span className="line-clamp-1 text-xs font-medium leading-snug text-[#F5F1E9] sm:text-sm">
                  {choice.label}
                </span>
                <span
                  className="text-sm text-[#B5B0A8] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#E8C568]"
                  aria-hidden="true"
                >
                  →
                </span>
              </div>
            </motion.button>
          )
        })}
      </motion.div>
    </motion.div>
  )
}
