'use client';

import { useState } from 'react';

import { Field, errorBorder, inputClass, okBorder } from '@/components/profile-fields';

const CM_PER_INCH = 2.54;

function toFeetInches(cm: number | null) {
  if (!cm) return { feet: '', inches: '' };
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: String(Math.floor(totalInches / 12)), inches: String(totalInches % 12) };
}

/** Height is always stored in cm; ft/in is only a way to type it. */
export function HeightInput({ value, onChange, error }: { value: number | null; onChange: (cm: number | null) => void; error?: string }) {
  const [unit, setUnit] = useState<'cm' | 'ft'>('cm');
  const [feetInches, setFeetInches] = useState(() => toFeetInches(value));
  const border = error ? errorBorder : okBorder;

  const switchUnit = (next: 'cm' | 'ft') => {
    if (next === 'ft') setFeetInches(toFeetInches(value));
    setUnit(next);
  };

  const updateFeetInches = (next: { feet: string; inches: string }) => {
    setFeetInches(next);
    const totalInches = Number(next.feet || 0) * 12 + Number(next.inches || 0);
    onChange(totalInches ? Math.round(totalInches * CM_PER_INCH) : null);
  };

  return (
    <Field label="Height" error={error} hint={value ? `${value} cm` : undefined}>
      <div className="flex gap-2">
        {unit === 'cm' ? (
          <input
            type="number"
            inputMode="numeric"
            min={50}
            max={250}
            placeholder="165"
            value={value ?? ''}
            onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
            className={`${inputClass} ${border}`}
          />
        ) : (
          <>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={8}
              placeholder="5 ft"
              value={feetInches.feet}
              onChange={(event) => updateFeetInches({ ...feetInches, feet: event.target.value })}
              className={`${inputClass} ${border}`}
            />
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={11}
              placeholder="5 in"
              value={feetInches.inches}
              onChange={(event) => updateFeetInches({ ...feetInches, inches: event.target.value })}
              className={`${inputClass} ${border}`}
            />
          </>
        )}
        <div className="flex shrink-0 overflow-hidden rounded-xl border border-slate-700">
          {(['cm', 'ft'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => switchUnit(option)}
              className={`px-3 text-sm font-medium transition ${unit === option ? 'bg-violet-500 text-white' : 'bg-slate-950/70 text-slate-300 hover:text-white'}`}
            >
              {option === 'cm' ? 'cm' : 'ft/in'}
            </button>
          ))}
        </div>
      </div>
    </Field>
  );
}
