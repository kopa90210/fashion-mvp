'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Plus, Search, Shirt, UserRound } from 'lucide-react'

const links = [
  { href: '/outfits', label: 'Today', Icon: Home },
  { href: '/wardrobe', label: 'Wardrobe', Icon: Shirt },
  { href: '/search', label: 'Search', Icon: Search },
  { href: '/profile', label: 'Profile', Icon: UserRound },
]

export default function BottomNav() {
  const pathname = usePathname()
  if (pathname.startsWith('/quiz')) return null

  return (
    <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-5 z-[100] flex items-center justify-center gap-2 px-3 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center gap-1 rounded-full border border-[#d8cec2] bg-[#fffdfa]/95 p-1 shadow-lg shadow-[#3e3328]/10 backdrop-blur">
        {links.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link key={href} href={href} aria-label={label} aria-current={active ? 'page' : undefined}
              className={`flex h-14 w-[3.25rem] flex-col items-center justify-center gap-1 rounded-full transition-colors ${active ? 'bg-[#1d1b18] text-[#fffdfa]' : 'text-[#7a6f62] hover:bg-[#eee7dd] hover:text-[#1d1b18]'}`}>
              <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.4 : 1.8} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
      <Link href="/wardrobe/add" aria-label="Add wardrobe item" title="Add wardrobe item"
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#1d1b18] text-[#fffdfa] shadow-lg shadow-[#3e3328]/20 transition-transform hover:scale-105">
        <Plus className="size-6" />
      </Link>
    </nav>
  )
}
