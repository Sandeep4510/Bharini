'use client';

import { useState } from 'react';

import { Field, errorBorder, inputClass, okBorder } from '@/components/profile-fields';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, i) => THIS_YEAR - i);

export function ageFrom(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  const today = new Date();
  const hadBirthday = today.getMonth() > born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate());
  return today.getFullYear() - born.getFullYear() - (hadBirthday ? 0 : 1);
}

function daysIn(month: string, year: string) {
  // day 0 of the next month is the last day of this one; leap years count when the year is known
  return month ? new Date(Number(year || 2000), Number(month), 0).getDate() : 31;
}

/** Date of birth as Day / Month / Year dropdowns. Emits 'YYYY-MM-DD', or '' until all three are picked. */
export function DateOfBirthInput({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string }) {
  const [initialYear, initialMonth, initialDay] = value ? value.split('-') : ['', '', ''];
  const [parts, setParts] = useState({ day: initialDay ?? '', month: initialMonth ?? '', year: initialYear ?? '' });
  const className = `${inputClass} ${error ? errorBorder : okBorder}`;

  const update = (change: Partial<typeof parts>) => {
    const next = { ...parts, ...change };
    if (next.day && Number(next.day) > daysIn(next.month, next.year)) next.day = '';
    setParts(next);
    onChange(next.day && next.month && next.year ? `${next.year}-${next.month}-${next.day}` : '');
  };

  return (
    <Field label="Date of birth" error={error}>
      <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
        <select aria-label="Day" value={parts.day} onChange={(event) => update({ day: event.target.value })} className={className}>
          <option value="">Day</option>
          {Array.from({ length: daysIn(parts.month, parts.year) }, (_, i) => String(i + 1).padStart(2, '0')).map((day) => (
            <option key={day} value={day}>
              {Number(day)}
            </option>
          ))}
        </select>
        <select aria-label="Month" value={parts.month} onChange={(event) => update({ month: event.target.value })} className={className}>
          <option value="">Month</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={String(i + 1).padStart(2, '0')}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label="Year" value={parts.year} onChange={(event) => update({ year: event.target.value })} className={className}>
          <option value="">Year</option>
          {YEARS.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </Field>
  );
}
