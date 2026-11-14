import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyOutfit } from '@/src/app/actions/outfit'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  feedback: vi.fn(), daily: vi.fn(), calibration: vi.fn(), owned: vi.fn(), dna: vi.fn(), save: vi.fn(), unsave: vi.fn(), isSaved: vi.fn(),
  worn: vi.fn(), notToday: vi.fn(),
  swapCandidates: vi.fn(), createSwap: vi.fn(),
  clicks: new Map<string, () => void>(), tasks: [] as Promise<void>[], effects: [] as (() => void | (() => void))[],
  redirect: vi.fn((path: string) => { throw new Error('REDIRECT:' + path) }),
}))
vi.mock('@/src/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>()
  return { ...original, useTransition: () => [false, (callback: () => Promise<void>) => { mocks.tasks.push(callback()) }], useEffect: (fn: () => void | (() => void)) => { mocks.effects.push(fn) } }
})
vi.mock('@/src/app/actions/outfit', () => ({ getDailyOutfit: mocks.daily, submitOutfitFeedback: mocks.feedback, shouldShowOutfitCalibration: mocks.calibration }))
vi.mock('@/src/app/actions/outfit-interactions', () => ({ recordOutfitWorn: mocks.worn, recordOutfitNotToday: mocks.notToday }))
vi.mock('@/src/app/actions/outfit-swaps', () => ({ getSwapCandidates: mocks.swapCandidates, createSwappedOutfit: mocks.createSwap }))
vi.mock('@/src/app/actions/wardrobe', () => ({ getUserWardrobeItems: mocks.owned }))
vi.mock('@/src/app/actions/fashion-dna', () => ({ getFashionDnaSummary: mocks.dna }))
vi.mock('@/src/app/actions/profile', () => ({ isOutfitSaved: mocks.isSaved, saveOutfitLook: mocks.save, unsaveOutfitLook: mocks.unsave }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, usePathname: () => '/outfits' }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', props, children) }))
vi.mock('next/image', () => ({ default: ({ src, alt, className, unoptimized }: React.ComponentProps<'img'> & { unoptimized?: boolean }) => React.createElement('img', { src, alt, className, 'data-private-preview': unoptimized }) }))
vi.mock('@/components/ui/button', () => ({
  buttonVariants: () => 'button',
  Button: ({ children, onClick, variant, ...props }: React.ComponentProps<'button'> & { variant?: string }) => {
    const textLabel = React.Children.toArray(children).filter((child) => typeof child === 'string').join('')
    const label = textLabel || (props['aria-label'] as string) || ''
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
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null })
  vi.clearAllMocks(); mocks.clicks.clear(); mocks.tasks.length = 0; mocks.effects.length = 0
  mocks.calibration.mockResolvedValue(false)
  mocks.daily.mockResolvedValue(outfit)
  mocks.owned.mockResolvedValue(ownedIds.map((id) => ({ id })))
  mocks.dna.mockResolvedValue({ signals: [], feedbackCount: 0 })
  mocks.feedback.mockResolvedValue({ vector: { minimal: 0.8 }, changedTags: ['minimal'] })
  mocks.worn.mockResolvedValue({ interactionId: 'worn-interaction' })
  mocks.notToday.mockResolvedValue({ interactionId: 'not-today-interaction' })
  mocks.swapCandidates.mockResolvedValue([])
  mocks.createSwap.mockResolvedValue({ outfitId: 'swapped-outfit' })
  mocks.save.mockResolvedValue({ success: true, savedAt: '2026-11-01' })
  mocks.unsave.mockResolvedValue({ success: true })
  mocks.isSaved.mockResolvedValue(false)
})

describe('Today presentation', () => {
  it('simplifies visual hierarchy with Wear this, Save, Swap, and collapsed recommendation feedback', () => {
    const html = render()
    expect(html).toContain('Today')
    expect(html).toContain('From your wardrobe')
    expect(html).toContain('Linen shirt · Straight trousers · Sneakers')
    expect(html.indexOf('Outfit pieces')).toBeLessThan(html.indexOf('<h2'))
    expect(html.indexOf('<h2')).toBeLessThan(html.indexOf('Wear this'))
    expect(html.indexOf('Wear this')).toBeLessThan(html.indexOf('Swap a piece'))
    expect(html.indexOf('Swap a piece')).toBeLessThan(html.indexOf('Not today'))
    expect(html.indexOf('Not today')).toBeLessThan(html.indexOf('Why this works'))
    expect(html.indexOf('Why this works')).toBeLessThan(html.indexOf('Help improve your recommendations'))
    expect(html.indexOf('Help improve your recommendations')).toBeLessThan(html.indexOf('Not my style'))
    expect(html.indexOf('Not my style')).toBeLessThan(html.indexOf('Love this'))
    expect(html).toMatch(/<details class="[^"]*">\s*<summary[^>]*>Help improve your recommendations/)
    expect(html).toContain('aria-label="Save this look (status unconfirmed)"')
    expect(html).not.toContain('Your style preferences')
    expect(html).not.toContain('Fashion DNA')
    for (const text of ['weather', 'calendar', '1 per day']) expect(html).not.toContain(text)
  })
  it('includes one-piece clothing in the human-facing outfit identity', () => {
    const dressOutfit: DailyOutfit = {
      id: 'dress-outfit',
      score: 0.9,
      vector: { minimal: 0.7 },
      reasons: ['because you liked clean pieces'],
      items: [
        {
          id: 'dress',
          display_name: 'Midi dress',
          image_url: '/dress.png',
          layer_role: 'one_piece',
          style_tags: { minimal: 0.8 },
        },
        {
          id: 'heels',
          display_name: 'Heels',
          image_url: '/heels.png',
          layer_role: 'footwear',
          style_tags: { formal: 0.6 },
        },
      ],
    }

    const html = renderToStaticMarkup(
      React.createElement(DailyOutfitScreen, {
        outfit: dressOutfit,
        initialSignals: [],
        feedbackCount: 0,
        ownedItemIds: dressOutfit.items.map((item) => item.id),
      }),
    )

    expect(html).toContain('Midi dress · Heels')
  })

  it('never claims curated or mixed looks are confirmed owned clothing', () => {
    const html = render(['shirt'])
    expect(html).toContain('Style inspiration')
    expect(html).toContain('These pieces are not all part of your confirmed wardrobe.')
    expect(html).not.toContain('From your wardrobe')
    expect(html).not.toContain('Not today')
    expect(html).not.toContain('Wear this')
    expect(html).not.toContain('Swap a piece')
  })
  it('records wearing through the behavioral action only with a deterministic key', async () => {
    render(); mocks.clicks.get("Wear this")!()
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
    ["Wear this", mocks.worn],
    ['Not today', mocks.notToday],
  ] as const)('protects %s from rapid double clicks', async (label, action) => {
    render()
    const click = mocks.clicks.get(label)!
    click(); click()
    await Promise.all(mocks.tasks)
    expect(action).toHaveBeenCalledTimes(1)
  })
  it.each([
    ["Wear this", mocks.worn],
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
  it('preserves private previews and keeps the shared editorial FlatLay presentation', () => {
    expect(render()).toContain('data-private-preview="true"')
    const original = renderToStaticMarkup(React.createElement(FlatLay, { items: outfit.items }))
    expect(original).toContain('object-contain')
    expect(original).toContain('data-layout="separates"')
    expect(original).not.toContain('shadow-md')
    expect(render()).toContain('object-contain')
  })
  it('initializes saved state from persisted data and handles save/unsave toggle with rollback', async () => {
    // 1. Initialized as saved
    const savedHtml = renderToStaticMarkup(
      React.createElement(DailyOutfitScreen, {
        outfit,
        initialSignals: [],
        feedbackCount: 0,
        ownedItemIds: ownedIds,
        initialSaved: true,
      })
    )
    expect(savedHtml).toContain('aria-label="Remove from saved looks"')
    expect(savedHtml).toContain('aria-pressed="true"')

    // 2. Initialized as unsaved
    const unsavedHtml = renderToStaticMarkup(
      React.createElement(DailyOutfitScreen, {
        outfit,
        initialSignals: [],
        feedbackCount: 0,
        ownedItemIds: ownedIds,
        initialSaved: false,
      })
    )
    expect(unsavedHtml).toContain('aria-label="Save this look"')
    expect(unsavedHtml).toContain('aria-pressed="false"')

    // 3. Status unconfirmed (lookup failure does not present as confirmed unsaved)
    const unknownHtml = renderToStaticMarkup(
      React.createElement(DailyOutfitScreen, {
        outfit,
        initialSignals: [],
        feedbackCount: 0,
        ownedItemIds: ownedIds,
        initialSaved: null,
      })
    )
    expect(unknownHtml).toContain('Status unconfirmed · Click to save')
    expect(unknownHtml).toContain('aria-label="Save this look (status unconfirmed)"')
    expect(unknownHtml).toContain('data-saved-status="unknown"')

    // 4. Click save executes mutation
    render()
    const saveClick = mocks.clicks.get('Save this look (status unconfirmed)') || mocks.clicks.get('Save this look')!
    expect(saveClick).toBeDefined()
    saveClick()
    await Promise.all(mocks.tasks)
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(outfit.id)
    expect(mocks.unsave).not.toHaveBeenCalled()
  })

  it('keeps the outfit actionable after Love this positive feedback and shows confirmation', async () => {
    render()
    const loveClick = mocks.clicks.get('Love this')!
    loveClick()
    await Promise.all(mocks.tasks)

    // Positive feedback persisted with existing contract
    expect(mocks.feedback).toHaveBeenCalledExactlyOnceWith(outfit.id, true, 'outfit-feedback:daily-outfit')
    // Does NOT advance outfit or trigger wear/save automatically
    expect(mocks.daily).not.toHaveBeenCalled()
    expect(mocks.worn).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()

    // Wear this remains available and actionable
    const wearClick = mocks.clicks.get('Wear this')!
    wearClick()
    await Promise.all(mocks.tasks)
    expect(mocks.worn).toHaveBeenCalledExactlyOnceWith(outfit.id, 'today:worn:daily-outfit')
  })

  it('recovers from feedback failures and allows the user to retry', async () => {
    mocks.feedback.mockRejectedValueOnce(new Error('Network failure'))
    render()
    const loveClick = mocks.clicks.get('Love this')!
    loveClick()
    await Promise.all(mocks.tasks)

    // Failed feedback does not advance or lock out
    expect(mocks.feedback).toHaveBeenCalledTimes(1)
    expect(mocks.daily).not.toHaveBeenCalled()

    // User can retry
    loveClick()
    await Promise.all(mocks.tasks)
    expect(mocks.feedback).toHaveBeenCalledTimes(2)
  })


  it('guarantees an older deferred saved-status lookup cannot overwrite a newer Save action for the same outfit', async () => {
    let resolveLookup!: (value: boolean) => void
    const lookupPromise = new Promise<boolean>((resolve) => {
      resolveLookup = resolve
    })
    mocks.isSaved.mockReturnValueOnce(lookupPromise)

    let reportedStatus = ''
    renderToStaticMarkup(
      React.createElement(DailyOutfitScreen, {
        outfit,
        initialSignals: [],
        feedbackCount: 0,
        ownedItemIds: ownedIds,
        initialSaved: null,
        onSavedStatusChange: (status) => {
          reportedStatus = status
        },
      })
    )

    // Trigger all mounted effects (including DailyOutfitScreen's saved status effect)
    mocks.effects.forEach((fn) => fn())
    expect(mocks.isSaved).toHaveBeenCalledWith(outfit.id)

    // User saves before lookup completes
    const saveClick = mocks.clicks.get('Save this look (status unconfirmed)') || mocks.clicks.get('Save this look')!
    expect(saveClick).toBeDefined()
    saveClick()
    await Promise.all(mocks.tasks)
    expect(mocks.save).toHaveBeenCalledWith(outfit.id)
    expect(reportedStatus).toBe('saved')

    // Now resolve the older lookup with the opposite status (false / unsaved)
    resolveLookup(false)
    await Promise.resolve()
    await Promise.resolve()

    // Confirm newer Save remains authoritative: revision guard prevented older lookup from reverting status to unsaved
    expect(reportedStatus).toBe('saved')
  })

  it('avoids an unnecessary client lookup when valid server initial state exists', () => {
    renderToStaticMarkup(
      React.createElement(DailyOutfitScreen, {
        outfit,
        initialSignals: [],
        feedbackCount: 0,
        ownedItemIds: ownedIds,
        initialSaved: true,
      })
    )

    mocks.effects.forEach((fn) => fn())
    expect(mocks.isSaved).not.toHaveBeenCalled()
  })

  it('exposes status unconfirmed accessibly beyond a hover-only title', () => {
    const html = renderToStaticMarkup(
      React.createElement(DailyOutfitScreen, {
        outfit,
        initialSignals: [],
        feedbackCount: 0,
        ownedItemIds: ownedIds,
        initialSaved: null,
      })
    )

    // 1. Screen reader accessible label
    expect(html).toContain('aria-label="Save this look (status unconfirmed)"')
    // 2. Screen reader accessible embedded element
    expect(html).toContain('<span class="sr-only">(status unconfirmed)</span>')
    // 3. Machine-readable data attribute
    expect(html).toContain('data-saved-status="unknown"')
    // 4. Subtle visual hint
    expect(html).toContain('border-dashed')
  })

  it('shows Today and Wardrobe visibly without adding Plan', () => {
    const html = renderToStaticMarkup(React.createElement(BottomNav))
    expect(html).toContain('>Today</span>')
    expect(html).toContain('>Wardrobe</span>')
    expect(html).toContain('fixed')
    expect(html).toContain('lg:static')
    expect(html).toContain('stylegraph-bottom-nav')
    expect(html).not.toContain('aria-label="Home"')
    expect(html).not.toContain('aria-label="Closet"')
    expect(html).not.toContain('Plan')
  })
})

describe('Today server orchestration remains unchanged', () => {
  it('redirects signed-out visitors before querying wardrobe or generating outfits', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(OutfitsPage()).rejects.toThrow('REDIRECT:/login')
    expect(mocks.calibration).not.toHaveBeenCalled()
    expect(mocks.daily).not.toHaveBeenCalled()
    expect(mocks.owned).not.toHaveBeenCalled()
  })
  it('preserves the calibration redirect before daily generation', async () => {
    mocks.calibration.mockResolvedValue(true)
    await expect(OutfitsPage()).rejects.toThrow('REDIRECT:/outfits/calibration')
    expect(mocks.daily).not.toHaveBeenCalled()
    expect(mocks.owned).not.toHaveBeenCalled()
  })
  it('passes confirmed owned IDs and persisted saved state without replacing the selected outfit', async () => {
    mocks.isSaved.mockResolvedValueOnce(true)
    const page = await OutfitsPage()
    expect(page.props.outfit).toBe(outfit)
    expect(page.props.ownedItemIds).toEqual(ownedIds)
    expect(page.props.initialSaved).toBe(true)
    expect(mocks.isSaved).toHaveBeenCalledWith(outfit.id)
    expect(mocks.daily).toHaveBeenCalledTimes(1)
  })

  it('falls back to null initialSaved if saved state lookup fails on the server', async () => {
    mocks.isSaved.mockRejectedValueOnce(new Error('lookup error'))
    const page = await OutfitsPage()
    expect(page.props.outfit).toBe(outfit)
    expect(page.props.initialSaved).toBeNull()
  })
  it('hands a calibrated user with no owned clothes into real-outfit upload', async () => {
    mocks.daily.mockResolvedValue(null)
    mocks.owned.mockResolvedValue([])
    const html = renderToStaticMarkup(await OutfitsPage())
    expect(html).toContain('Your closet is taking shape')
    expect(html).toContain('Add a few more pieces to create your first outfit.')
    expect(html).toContain('href="/wardrobe/add"')
    expect(html).toContain('Add more clothes')
    expect(html).not.toContain('/quiz?done=true')
  })

  it('explains the minimum complete-look requirement when some owned pieces already exist', async () => {
    mocks.daily.mockResolvedValue(null)
    mocks.owned.mockResolvedValue([{ id: 'owned-dress' }])
    const html = renderToStaticMarkup(await OutfitsPage())
    expect(html).toContain('Your closet is taking shape')
    expect(html).toContain('Add a few more pieces to create your first outfit.')
    expect(html).toContain('Add more clothes')
    expect(html).not.toContain('No eligible wardrobe items')
    expect(html).not.toContain('Fashion DNA missing')
  })
})
