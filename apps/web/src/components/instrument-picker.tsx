'use client';

import { useState } from 'react';

import type { Option } from '@bharini/types';

import { errorBorder, inputClass, okBorder } from '@/components/profile-fields';

const chip = 'inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition';
const chipOn = 'border-violet-400 bg-violet-500/20 text-white';
const chipOff = 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-500';

/** Common instruments as checkboxes, plus "Others" with a comma-separated box for uncommon ones. */
export function InstrumentPicker({
  options,
  value,
  onChange,
  error,
}: {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
}) {
  const known = new Set(options.map((option) => option.value));
  const picked = value.filter((name) => known.has(name));
  const [othersText, setOthersText] = useState(value.filter((name) => !known.has(name)).join(', '));
  const [showOthers, setShowOthers] = useState(Boolean(othersText));

  const emit = (nextPicked: string[], nextOthers: string, others: boolean) =>
    onChange([...nextPicked, ...(others ? nextOthers.split(',').map((name) => name.trim()).filter(Boolean) : [])]);

  const toggle = (name: string) =>
    emit(picked.includes(name) ? picked.filter((item) => item !== name) : [...picked, name], othersText, showOthers);

  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-medium text-slate-200">Instruments you play</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = picked.includes(option.value);
          return (
            <label key={option.value} className={`${chip} ${checked ? chipOn : chipOff}`}>
              <input type="checkbox" checked={checked} onChange={() => toggle(option.value)} className="h-4 w-4 accent-violet-500" />
              {option.label}
            </label>
          );
        })}
        <label className={`${chip} ${showOthers ? chipOn : chipOff}`}>
          <input
            type="checkbox"
            checked={showOthers}
            onChange={(event) => {
              setShowOthers(event.target.checked);
              emit(picked, othersText, event.target.checked);
            }}
            className="h-4 w-4 accent-violet-500"
          />
          Others
        </label>
      </div>
      {showOthers ? (
        <input
          value={othersText}
          maxLength={300}
          placeholder="e.g. Morsing, Jal tarang, Kanjira (separate with commas)"
          onChange={(event) => {
            setOthersText(event.target.value);
            emit(picked, event.target.value, true);
          }}
          aria-label="Other instruments"
          className={`${inputClass} ${error ? errorBorder : okBorder} mt-3`}
        />
      ) : null}
      {error ? <span className="mt-1.5 block text-sm text-red-300">{error}</span> : null}
    </fieldset>
  );
}
