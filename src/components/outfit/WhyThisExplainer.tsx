'use client'

import { ChevronDown } from 'lucide-react'

export interface WhyThisExplainerProps {
  reasons?: string[]
  defaultOpen?: boolean
}

export default function WhyThisExplainer({ reasons = [], defaultOpen = false }: WhyThisExplainerProps) {
  const explanations = reasons.map((reason) => reason.trim()).filter(Boolean)
  return (
    <details open={defaultOpen || undefined} className="group text-[#1d1b18]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-base font-medium [&::-webkit-details-marker]:hidden">Why this works<ChevronDown aria-hidden="true" className="size-4 text-[#6d6257] transition-transform group-open:rotate-180" /></summary>
      {explanations.length > 0 ? <ul className="mt-3 space-y-3 text-sm leading-6 text-[#6d6257]">{explanations.map((reason, index) => <li key={`${index}:${reason}`} className="flex gap-3"><span aria-hidden="true" className="mt-2.5 size-1 shrink-0 rounded-full bg-[#6d6257]" /><span>{reason}</span></li>)}</ul> : <p className="mt-3 text-sm leading-6 text-[#6d6257]">No explanation is available for this look yet.</p>}
    </details>
  )
}
