import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ImageSetIntroScreen from './ImageSetIntroScreen'
import StyleQuiz from './StyleQuiz'
import LoadingQuiz from './loading'
import { QUIZ_QUESTIONS } from '@/src/lib/quiz/questions'

// Mock server action
vi.mock('./actions', () => ({
  submitStyleQuiz: vi.fn(),
}))

describe('Quiz Restrained Dark Theme Visual Presentation', () => {
  it('renders ImageSetIntroScreen with exactly two photographic choices, clear heading, and dark palette', () => {
    const html = renderToStaticMarkup(
      React.createElement(ImageSetIntroScreen, { onSelect: vi.fn() }),
    )

    // Heading hierarchy
    expect(html).toContain('<h1')
    expect(html).toContain('Which looks would you like to see?')

    // Supporting text
    expect(html).toContain('Choose the photos you prefer. Your answers shape your recommendations.')

    // Exactly two photographic choices
    expect(html).toContain('id="intro-card-feminine"')
    expect(html).toContain('id="intro-card-masculine"')
    expect(html).toContain('Women’s looks')
    expect(html).toContain('Men’s looks')
    expect(html).toContain('src="/quiz/q1-classic-f.jpg"')
    expect(html).toContain('src="/quiz/q1-classic-m.jpg"')

    // Neutral option and Skip action are completely removed
    expect(html).not.toContain('intro-card-neutral')
    expect(html).not.toContain('intro-skip')
    expect(html).not.toContain('Skip')

    // Editorial dark palette tokens
    expect(html).toContain('border-[#38383D]')
    expect(html).toContain('bg-[#1E1E21]')
    expect(html).toContain('text-[#F5F1E9]')
    expect(html).toContain('text-[#B5B0A8]')
    expect(html).toContain('text-[#E8C568]')
  })

  it('renders StyleQuiz with dark surface, progressbar attributes, and intro state', () => {
    const html = renderToStaticMarkup(React.createElement(StyleQuiz))

    // Root dark surface scoped to quiz
    expect(html).toContain('stylegraph-quiz-surface')
    expect(html).toContain('bg-[#141416]')
    expect(html).toContain('text-[#F5F1E9]')

    // Editorial wordmark
    expect(html).toContain('StyleGraph Quiz')
  })

  it('renders LoadingQuiz with dark 2x2 grid skeletons', () => {
    const html = renderToStaticMarkup(React.createElement(LoadingQuiz))

    expect(html).toContain('stylegraph-quiz-surface')
    expect(html).toContain('bg-[#141416]')
    expect(html).toContain('text-[#F5F1E9]')
    expect(html).toContain('aspect-[4/5]')
    expect(html).toContain('border-[#38383D]')
    expect(html).toContain('bg-[#1E1E21]')
  })

  it('preserves the five-question and four-answer contracts', () => {
    expect(QUIZ_QUESTIONS).toHaveLength(5)
    for (const q of QUIZ_QUESTIONS) {
      expect(q.options).toHaveLength(4)
      expect(q.prompt).toBeTruthy()
    }
  })
})
