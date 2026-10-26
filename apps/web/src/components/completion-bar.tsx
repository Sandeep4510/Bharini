/** Hidden once the profile is complete; it comes back if the profile drops below 100%. */
export function CompletionBar({ percent }: { percent: number }) {
  if (percent >= 100) return null;
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-slate-200">Profile strength</p>
        <p className="text-2xl font-semibold text-white">{percent}%</p>
      </div>
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile completion"
      >
        <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-3 text-sm text-slate-300">
        💡 Complete profiles with all photos and videos get seen far more often by casting teams. Fill every slot below to boost your chances.
      </p>
    </div>
  );
}
