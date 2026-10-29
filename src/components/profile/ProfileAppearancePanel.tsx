'use client'

import React from 'react'
import { Check, Laptop, Moon, RotateCcw, Sparkles, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ACCENT_DEFINITIONS,
  type ProfileAccent,
  type ProfileAppearanceMode,
  type ProfileAppearancePreferences,
} from '@/src/lib/profile/appearance'

interface ProfileAppearancePanelProps {
  preferences: ProfileAppearancePreferences
  effectiveMode: 'light' | 'dark'
  onChangeMode: (mode: ProfileAppearanceMode) => void
  onChangeAccent: (accent: ProfileAccent) => void
  onReset: () => void
  onClose?: () => void
}

const MODES: Array<{
  key: ProfileAppearanceMode
  label: string
  icon: typeof Sun
}> = [
  { key: 'light', label: 'Light', icon: Sun },
  { key: 'dark', label: 'Dark', icon: Moon },
  { key: 'system', label: 'System', icon: Laptop },
]

const ACCENTS: ProfileAccent[] = ['sage', 'terracotta', 'plum', 'slate']

export default function ProfileAppearancePanel({
  preferences,
  effectiveMode,
  onChangeMode,
  onChangeAccent,
  onReset,
  onClose,
}: ProfileAppearancePanelProps) {
  return (
    <section
      aria-labelledby="appearance-settings-heading"
      className="mb-8 rounded-3xl border p-5 shadow-xs transition-colors duration-200 sm:p-7"
      style={{
        backgroundColor: 'var(--studio-surface)',
        borderColor: 'var(--studio-border)',
        color: 'var(--studio-text)',
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4" style={{ borderColor: 'var(--studio-border-subtle)' }}>
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4" style={{ color: 'var(--studio-accent)' }} />
            <h2
              id="appearance-settings-heading"
              className="text-lg font-medium tracking-tight"
            >
              Appearance on this device
            </h2>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--studio-text-muted)' }}>
            Choose how your private style studio feels on this screen.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-8 gap-1.5 rounded-full text-xs hover:bg-[#ebe3d8]/40"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            <RotateCcw className="size-3" />
            Reset appearance
          </Button>

          {onClose && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 rounded-full text-xs"
              style={{
                borderColor: 'var(--studio-border)',
                color: 'var(--studio-text)',
              }}
            >
              Done
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* Mode Selector */}
        <div>
          <span
            id="appearance-mode-label"
            className="block text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            Display Theme
          </span>

          <div
            role="radiogroup"
            aria-labelledby="appearance-mode-label"
            className="mt-2.5 grid grid-cols-3 gap-2.5 sm:max-w-md"
          >
            {MODES.map((item) => {
              const isSelected = preferences.mode === item.key
              const Icon = item.icon

              return (
                <button
                  key={item.key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onChangeMode(item.key)}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-3 py-3 text-xs font-medium transition-all ${
                    isSelected
                      ? 'shadow-xs ring-1'
                      : 'hover:border-stone-400'
                  }`}
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--studio-surface-subtle)'
                      : 'var(--studio-surface)',
                    borderColor: isSelected
                      ? 'var(--studio-accent)'
                      : 'var(--studio-border)',
                    color: isSelected
                      ? 'var(--studio-text)'
                      : 'var(--studio-text-muted)',
                  }}
                >
                  <Icon className="size-4" style={{ color: isSelected ? 'var(--studio-accent)' : undefined }} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Accent Selector */}
        <div>
          <span
            id="appearance-accent-label"
            className="block text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            Studio Accent
          </span>

          <div
            role="radiogroup"
            aria-labelledby="appearance-accent-label"
            className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {ACCENTS.map((accentKey) => {
              const definition = ACCENT_DEFINITIONS[accentKey]
              const isSelected = preferences.accent === accentKey
              const swatchColor =
                effectiveMode === 'dark'
                  ? definition.swatchDark
                  : definition.swatchLight

              return (
                <button
                  key={accentKey}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${definition.label} accent: ${definition.description}`}
                  onClick={() => onChangeAccent(accentKey)}
                  className={`group relative flex flex-col items-start rounded-2xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? 'shadow-xs ring-1'
                      : 'hover:border-stone-400'
                  }`}
                  style={{
                    backgroundColor: isSelected
                      ? 'var(--studio-surface-subtle)'
                      : 'var(--studio-surface)',
                    borderColor: isSelected
                      ? 'var(--studio-accent)'
                      : 'var(--studio-border)',
                  }}
                >
                  <div className="flex w-full items-center justify-between">
                    <span
                      className="size-5 rounded-full border shadow-2xs"
                      style={{
                        backgroundColor: swatchColor,
                        borderColor: 'rgba(0,0,0,0.1)',
                      }}
                    />

                    {isSelected && (
                      <span
                        className="flex size-4 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: swatchColor }}
                      >
                        <Check className="size-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>

                  <span
                    className="mt-2.5 text-xs font-medium"
                    style={{ color: 'var(--studio-text)' }}
                  >
                    {definition.label}
                  </span>

                  <span
                    className="mt-0.5 line-clamp-2 text-[11px] leading-tight"
                    style={{ color: 'var(--studio-text-muted)' }}
                  >
                    {definition.description}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
