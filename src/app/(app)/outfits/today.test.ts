import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyOutfit } from '@/src/app/actions/outfit'

const mocks = vi.hoisted(() => ({
  feedback: vi.fn(), daily: vi.fn(), calibration: vi.fn(), owned: vi.fn(), dna: vi.fn(),
  worn: vi.fn(), notToday: vi.fn(),
  swapCandidates: vi.fn(), createSwap: vi.fn(),
  clicks: new Map<string, () => void>(), tasks: [] as Promise<void>[],
  redirect: vi.fn((path: string) => { throw new Error('REDIRECT:' + path) }),
}))
vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>()
  return { ...original, useTransition: () => [false, (callback: () => Promise<void>) => { mocks.tasks.push(callback()) }] }
})
vi.mock('@/src/app/actions/outfit', () => ({ getDailyOutfit: mocks.daily, submitOutfitFeedback: mocks.feedback, shouldShowOutfitCalibration: mocks.calibration }))
vi.mock('@/src/app/actions/outfit-interactions', () => ({ recordOutfitWorn: mocks.worn, recordOutfitNotToday: mocks.notToday }))
vi.mock('@/src/app/actions/outfit-swaps', () => ({ getSwapCandidates: mocks.swapCandidates, createSwappedOutfit: mocks.createSwap }))
vi.mock('@/src/app/actions/wardrobe', () => ({ getUserWardrobeItems: mocks.owned }))
vi.mock('@/src/app/actions/fashion-dna', () => ({ getFashionDnaSummary: mocks.dna }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, usePathname: () => '/outfits' }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', props, children) }))
vi.mock('next/image', () => ({ default: ({ src, alt, className, unoptimized }: React.ComponentProps<'img'> & { unoptimized?: boolean }) => React.createElement('img', { src, alt, className, 'data-private-preview': unoptimized }) }))
vi.mock('@/components/ui/button', () => ({
  buttonVariants: () => 'button',
  Button: ({ children, onClick, variant, ...props }: React.ComponentProps<'button'> & { variant?: string }) => {
    const label = React.Children.toArray(children).filter((child) => typeof child === 'string').join('')
    if (onClick) mocks.clicks.set(label, () => onClick({} as React.MouseEvent<HTMLButtonElement>))
    return React.createElement('button', { ...props, 'data-variant': variant }, children)
  },
}))
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy({}, { get: (_target, tag: string) => ({ children, className, role }: React.ComponentProps<'div'>) => React.createElement(tag, { className, role }, children) }),
}))
vi.mock('@/src/components/fashion-dna/FashionDnaPanel', () => ({ default: () => React.createElement('div', {}, 'Fashion DNA') }))
import DailyOutfitScreen from './DailyOutfitScreen'
import OutfitsPage from './page'
import FlatLay from '@/src/components/outfit/FlatLay'
import WhyThisExplainer from '@/src/components/outfit/WhyThisExplainer'
import BottomNav from '@/src/components/nav/BottomNav'

const outfit: DailyOutfit = {
  id: 'daily-outfit', score: 0.8, vector: { minimal: 0.7 }, reasons: ['because you liked clean pieces', 'because you liked earth tones'],
  items: [
    { id: 'shirt', display_name: 'Linen shirt', image_url: 'https://images.test/storage/v1/object/sign/private-wardrobe-media/shirt.png', layer_role: 'base_layer', style_tags: { minimal: 0.8 } },
    { id: 'trousers', display_name: 'Straight trousers', image_url: '/trousers.png', layer_role: 'bottom', style_tags: { minimal: 0.7 } },
    { id: 'shoes', display_name: 'Sneakers', image_url: '/shoes.png', layer_role: 'footwear', style_tags: { minimal: 0.5 } },
  ],
}
const ownedIds = outfit.items.map((item) => item.id)
const render = (ownedItemIds = ownedIds) => renderToStaticMarkup(React.createElement(DailyOutfitScreen, { outfit, initialSignals: [], feedbackCount: 0, ownedItemIds }))

beforeEach(() => {
  vi.clearAllMocks(); mocks.clicks.clear(); mocks.tasks.length = 0
  mocks.calibration.mockResolvedValue(false)
  mocks.daily.mockResolvedValue(outfit)
  mocks.owned.mockResolvedValue(ownedIds.map((id) => ({ id })))
  mocks.dna.mockResolvedValue({ signals: [], feedbackCount: 0 })
  mocks.feedback.mockResolvedValue({ vector: { minimal: 0.8 }, changedTags: ['minimal'] })
  mocks.worn.mockResolvedValue({ interactionId: 'worn-interaction' })
  mocks.notToday.mockResolvedValue({ interactionId: 'not-today-interaction' })
  mocks.swapCandidates.mockResolvedValue([])
  mocks.createSwap.mockResolvedValue({ outfitId: 'swapped-outfit' })
})

describe('Today presentation', () => {
  it('puts the outfit, identity, reasons and feedback before secondary DNA', () => {
    const html = render()
    expect(html).toContain('Today')
    expect(html).toContain('From your wardrobe')
    expect(html).toContain('Linen shirt · Straight trousers · Sneakers')
    expect(html.indexOf('Outfit pieces')).toBeLessThan(html.indexOf('<h2'))
    expect(html.indexOf('<h2')).toBeLessThan(html.indexOf("I&#x27;m wearing this"))
    expect(html.indexOf("I&#x27;m wearing this")).toBeLessThan(html.indexOf('Why this works'))
    expect(html.indexOf('Why this works')).toBeLessThan(html.indexOf('Do you like this style?'))
    expect(html.indexOf('Do you like this style?')).toBeLessThan(html.indexOf('Not my style'))
    expect(html.indexOf('Love this')).toBeLessThan(html.indexOf('Your style preferences'))
    expect(html).toMatch(/<details class="[^"]*">\s*<summary[^>]*>Your style preferences/)
    expect(html).toContain('Not today')
    expect(html).toContain('Swap something')
    for (const text of ['weather', 'calendar', '1 per day']) expect(html).not.toContain(text)
  })
  it('never claims curated or mixed looks are confirmed owned clothing', () => {
    const html = render(['shirt'])
    expect(html).toContain('Style inspiration')
    expect(html).toContain('These pieces are not all part of your confirmed wardrobe.')
    expect(html).not.toContain('From your wardrobe')
    expect(html).not.toContain('Not today')
    expect(html).not.toContain("I&#x27;m wearing this")
    expect(html).not.toContain('Swap something')
  })
  it('records wearing through the behavioral action only with a deterministic key', async () => {
    render(); mocks.clicks.get("I'm wearing this")!()
    await Promise.all(mocks.tasks)
    expect(mocks.worn).toHaveBeenCalledExactlyOnceWith(outfit.id, 'today:worn:daily-outfit')
    expect(mocks.notToday).not.toHaveBeenCalled()
    expect(mocks.feedback).not.toHaveBeenCalled()
    expect(mocks.daily).not.toHaveBeenCalled()
  })
  it('records not-today through the behavioral action only without replacing the outfit', async () => {
    render(); mocks.clicks.get('Not today')!()
    await Promise.all(mocks.tasks)
    expect(mocks.notToday).toHaveBeenCalledExactlyOnceWith(outfit.id, 'today:not_today:daily-outfit')
    expect(mocks.worn).not.toHaveBeenCalled()
    expect(mocks.feedback).not.toHaveBeenCalled()
    expect(mocks.daily).not.toHaveBeenCalled()
  })
  it.each([['Not my style', false], ['Love this', true]] as const)('binds %s to the existing persisted preference action', async (label, liked) => {
    render()
    mocks.clicks.get(label)!()
    await Promise.all(mocks.tasks)
    expect(mocks.feedback).toHaveBeenCalledExactlyOnceWith(outfit.id, liked, 'outfit-feedback:daily-outfit')
    expect(mocks.daily).toHaveBeenCalledTimes(liked ? 0 : 1)
    expect(mocks.worn).not.toHaveBeenCalled()
    expect(mocks.notToday).not.toHaveBeenCalled()
  })
  it.each([
    ["I'm wearing this", mocks.worn],
    ['Not today', mocks.notToday],
  ] as const)('protects %s from rapid double clicks', async (label, action) => {
    render()
    const click = mocks.clicks.get(label)!
    click(); click()
    await Promise.all(mocks.tasks)
    expect(action).toHaveBeenCalledTimes(1)
  })
  it.each([
    ["I'm wearing this", mocks.worn],
    ['Not today', mocks.notToday],
  ] as const)('releases the %s lock after a failure so the user can retry', async (label, action) => {
    action.mockRejectedValueOnce(new Error('private backend error'))
    render()
    const click = mocks.clicks.get(label)!
    click()
    await Promise.all(mocks.tasks)
    click()
    await Promise.all(mocks.tasks)
    expect(action).toHaveBeenCalledTimes(2)
    expect(mocks.feedback).not.toHaveBeenCalled()
  })
  it('keeps feedback failures inside the existing rollback path', async () => {
    mocks.feedback.mockRejectedValue(new Error('private backend error'))
    render(); mocks.clicks.get('Not my style')!()
    await expect(Promise.all(mocks.tasks)).resolves.toBeDefined()
    expect(mocks.daily).not.toHaveBeenCalled()
  })
  it('renders reasons as independent list items and does not invent missing context', () => {
    const html = renderToStaticMarkup(React.createElement(WhyThisExplainer, { reasons: outfit.reasons, defaultOpen: true }))
    expect(html.match(/<li /g)).toHaveLength(2)
    expect(html).toContain('because you liked clean pieces')
    expect(html).not.toContain('clean pieces, because')
    const empty = renderToStaticMarkup(React.createElement(WhyThisExplainer))
    expect(empty).toContain('No explanation is available for this look yet.')
    expect(empty).not.toContain('preferences you saved earlier')
  })
  it('preserves private previews and keeps default FlatLay presentation for calibration', () => {
    expect(render()).toContain('data-private-preview="true"')
    const original = renderToStaticMarkup(React.createElement(FlatLay, { items: outfit.items }))
    expect(original).toContain('object-cover')
    expect(original).toContain('shadow-md')
    expect(render()).toContain('object-contain')
  })
  it('shows Today and Wardrobe visibly without adding Plan', () => {
    const html = renderToStaticMarkup(React.createElement(BottomNav))
    expect(html).toContain('>Today</span>')
    expect(html).toContain('>Wardrobe</span>')
    expect(html).not.toContain('aria-label="Home"')
    expect(html).not.toContain('aria-label="Closet"')
    expect(html).not.toContain('Plan')
  })
})

describe('Today server orchestration remains unchanged', () => {
  it('preserves the calibration redirect before daily generation', async () => {
    mocks.calibration.mockResolvedValue(true)
    await expect(OutfitsPage()).rejects.toThrow('REDIRECT:/outfits/calibration')
    expect(mocks.daily).not.toHaveBeenCalled()
    expect(mocks.owned).not.toHaveBeenCalled()
  })
  it('passes confirmed owned IDs for presentation without replacing the selected outfit', async () => {
    const page = await OutfitsPage()
    expect(page.props.outfit).toBe(outfit)
    expect(page.props.ownedItemIds).toEqual(ownedIds)
    expect(mocks.daily).toHaveBeenCalledTimes(1)
  })
  it('offers a real clothing upload in the empty state', async () => {
    mocks.daily.mockResolvedValue(null)
    const html = renderToStaticMarkup(await OutfitsPage())
    expect(html).toContain('href="/wardrobe/add"')
    expect(html).toContain('Add clothes')
    expect(html).not.toContain('/quiz?done=true')
  })
})
