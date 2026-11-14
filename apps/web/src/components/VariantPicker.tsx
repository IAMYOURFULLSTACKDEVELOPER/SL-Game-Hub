'use client';
import { useId } from 'react';
import type { GameVariant } from '@slgh/shared';

/** Pick a way to play (e.g. UNO Classic / Express / Stacking). Radio cards: arrow keys move between them. */
export function VariantPicker({ variants, value, onChange, label = 'Game type', disabled = false }: {
  variants: readonly GameVariant[]; value: string; onChange: (id: string) => void; label?: string; disabled?: boolean;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled}>
      <legend className="label">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {variants.map((v, i) => (
          <label key={v.id} className="variant-opt pop-in" style={{ ['--i' as string]: i }}>
            <input type="radio" name={name} value={v.id} checked={value === v.id} onChange={() => onChange(v.id)} className="peer sr-only" />
            <span className="variant-card">
              <span className="variant-dot" aria-hidden />
              <span className="min-w-0">
                <span className="block font-semibold text-heading">{v.name}</span>
                <span className="block text-[13px] leading-snug text-muted">{v.blurb}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The chosen variant's name, for badges during a game ("Stacking"); nothing for the default. */
export function variantName(variants: readonly GameVariant[], id: string | undefined) {
  const v = variants.find((x) => x.id === id);
  return v && v.id !== variants[0].id ? v.name : null;
}
