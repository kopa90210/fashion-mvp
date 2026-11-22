import { createClient } from '@/src/lib/supabase/server'
import { browseCatalog, parseBrowseFilters } from '@/src/lib/stylist/browse'
import { runtimeCatalog } from '@/src/lib/stylist/catalog'
import { pilotAllows } from '@/src/lib/stylist/pilot'

const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store' },
})

export async function GET(request: Request) {
  if (process.env.ENABLE_STYLIST !== 'true') return json({ error: 'Search is not enabled' }, 404)
  if (request.url.length > 2048) return json({ error: 'Search query is too long' }, 400)
  const filters = parseBrowseFilters(new URL(request.url).searchParams)
  if (!filters) return json({ error: 'Invalid search filters' }, 400)
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'Sign in to browse products' }, 401)
    if (!pilotAllows(user.id)) return json({ error: 'Search is not enabled' }, 404)
    return json(browseCatalog(runtimeCatalog(), filters))
  } catch {
    return json({ error: 'Search is unavailable. Try again.' }, 503)
  }
}
