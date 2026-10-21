import type { Discipline, Option } from '@bharini/types';

export function DisciplinePicker({
  options,
  value,
  onChange,
  error,
}: {
  options: Option[];
  value: Discipline[];
  onChange: (value: Discipline[]) => void;
  error?: string;
}) {
  const toggle = (discipline: Discipline) =>
    onChange(value.includes(discipline) ? value.filter((item) => item !== discipline) : [...value, discipline]);

  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-medium text-slate-200">I work as (pick all that apply)</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const discipline = option.value as Discipline;
          const checked = value.includes(discipline);
          return (
            <label
              key={discipline}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${
                checked ? 'border-violet-400 bg-violet-500/20 text-white' : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-500'
              }`}
            >
              <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(discipline)} />
              {checked ? '✓ ' : ''}
              {option.label}
            </label>
          );
        })}
      </div>
      {error ? <span className="mt-1.5 block text-sm text-red-300">{error}</span> : null}
    </fieldset>
  );
}
