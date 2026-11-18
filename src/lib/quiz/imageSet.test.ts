import { describe, it, expect } from 'vitest'
import { getOptionImage, type SingleImageOption, type GenderedImageOption } from './imageSet'
import { QUIZ_QUESTIONS, QUIZ_QUESTIONS_FOR_SCORING } from './questions'
import { computeStyleVector, parseQuizSignals } from './scoring'

describe('getOptionImage', () => {
  const singleOpt: SingleImageOption = {
    id: 'opt1',
    label: 'Single option',
    imageUrl: '/quiz/single.jpg',
  }

  const genderedOpt: GenderedImageOption = {
    id: 'opt2',
    label: 'Gendered option',
    images: {
      masculine: '/quiz/m.jpg',
      feminine: '/quiz/f.jpg',
    },
  }

  const incompleteOpt: GenderedImageOption = {
    id: 'opt3',
    label: 'Incomplete option',
    images: {
      masculine: '/quiz/m.jpg',
      feminine: null,
    },
  }

  const nullOpt: GenderedImageOption = {
    id: 'opt4',
    label: 'Unconfigured option',
    images: {
      masculine: null,
      feminine: null,
    },
  }

  it('SingleImageOption returns its imageUrl regardless of imageSet', () => {
    expect(getOptionImage(singleOpt, 'masculine', 0)).toBe('/quiz/single.jpg')
    expect(getOptionImage(singleOpt, 'feminine', 1)).toBe('/quiz/single.jpg')
    expect(getOptionImage(singleOpt, 'neutral', 2)).toBe('/quiz/single.jpg')
  })

  it('GenderedImageOption returns images.masculine when imageSet is "masculine"', () => {
    expect(getOptionImage(genderedOpt, 'masculine', 0)).toBe('/quiz/m.jpg')
    expect(getOptionImage(genderedOpt, 'masculine', 1)).toBe('/quiz/m.jpg')
  })

  it('GenderedImageOption returns images.feminine when imageSet is "feminine"', () => {
    expect(getOptionImage(genderedOpt, 'feminine', 0)).toBe('/quiz/f.jpg')
    expect(getOptionImage(genderedOpt, 'feminine', 1)).toBe('/quiz/f.jpg')
  })

  it('never substitutes from the opposite set when preferred image is null', () => {
    // When feminine is null, masculine must NOT be returned for 'feminine' preference
    expect(getOptionImage(incompleteOpt, 'feminine', 0)).toBeNull()
    // When masculine is present, it returns masculine for 'masculine' preference
    expect(getOptionImage(incompleteOpt, 'masculine', 0)).toBe('/quiz/m.jpg')
    // When both are null, both return null
    expect(getOptionImage(nullOpt, 'masculine', 0)).toBeNull()
    expect(getOptionImage(nullOpt, 'feminine', 0)).toBeNull()
  })

  it('GenderedImageOption with imageSet "neutral" alternates based on questionIndex without opposite substitution', () => {
    expect(getOptionImage(genderedOpt, 'neutral', 0)).toBe('/quiz/m.jpg')
    expect(getOptionImage(genderedOpt, 'neutral', 1)).toBe('/quiz/f.jpg')
    expect(getOptionImage(genderedOpt, 'neutral', 2)).toBe('/quiz/m.jpg')
    expect(getOptionImage(genderedOpt, 'neutral', 3)).toBe('/quiz/f.jpg')

    // If alternating to an index where that slot is null, it returns null instead of falling back to opposite
    expect(getOptionImage(incompleteOpt, 'neutral', 0)).toBe('/quiz/m.jpg')
    expect(getOptionImage(incompleteOpt, 'neutral', 1)).toBeNull()
  })

  it('resolves all 20 options across all five quiz questions correctly with verified disk assets', async () => {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')

    expect(QUIZ_QUESTIONS).toHaveLength(5)

    for (let stepIndex = 0; stepIndex < QUIZ_QUESTIONS.length; stepIndex++) {
      const question = QUIZ_QUESTIONS[stepIndex]
      expect(question.options).toHaveLength(4)

      for (const option of question.options) {
        expect(option.images).toBeDefined()
        expect(typeof option.images.masculine).toBe('string')
        expect(typeof option.images.feminine).toBe('string')

        const m = getOptionImage(option, 'masculine', stepIndex)
        const f = getOptionImage(option, 'feminine', stepIndex)
        const neutral = getOptionImage(option, 'neutral', stepIndex)

        expect(m).toBeTruthy()
        expect(f).toBeTruthy()
        expect(m).not.toBe(f)
        expect(neutral).toBe(stepIndex % 2 === 0 ? m : f)

        // Verify each configured image exists on disk
        expect(existsSync(join(process.cwd(), 'public', m!))).toBe(true)
        expect(existsSync(join(process.cwd(), 'public', f!))).toBe(true)
      }
    }
  })

  it('keeps scoring submissions completely unchanged and decoupled from imageSet', () => {
    const testAnswers = QUIZ_QUESTIONS.map((q) => ({
      questionId: q.id,
      optionId: q.options[0].id,
    }))
    const signals = parseQuizSignals(testAnswers, QUIZ_QUESTIONS_FOR_SCORING)
    const vector = computeStyleVector(testAnswers, QUIZ_QUESTIONS_FOR_SCORING)

    expect(signals.primaryOccasion).toBe('work-university')
    expect(signals.style).toBe('minimal')
    expect(signals.fit).toBe('slim')
    expect(signals.formality).toBe('casual')
    expect(signals.exploration).toBe('familiar')
    expect(vector.minimal).toBeGreaterThan(0)
  })

  it('verifies intro card assets exist locally on disk for both choices', async () => {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')

    const introAssets = ['/quiz/q1-classic-f.jpg', '/quiz/q1-classic-m.jpg']
    for (const assetPath of introAssets) {
      expect(existsSync(join(process.cwd(), 'public', assetPath))).toBe(true)
    }
  })
})
