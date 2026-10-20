import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-500 font-bold text-white">
              B
            </span>
            <span>Bharini</span>
          </Link>
          <Link href="/" className="text-sm text-slate-300 transition hover:text-white">
            Back to home
          </Link>
        </div>

        <div className="grid overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-violet-950/20 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="hidden border-r border-slate-800 bg-gradient-to-br from-violet-600/30 via-slate-900 to-slate-950 p-8 lg:flex lg:flex-col lg:justify-between">
            <div>
              <p className="mb-4 inline-flex rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-violet-200">
                Artist-first platform
              </p>
              <h1 className="max-w-md text-4xl font-semibold leading-tight text-white">
                Build trust, discover talent, and publish casting calls faster.
              </h1>
            </div>

            <div className="space-y-4 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
                <p className="font-medium text-white">Verified profiles</p>
                <p className="mt-2">Reduce scam risk and improve quality for artists and production houses.</p>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
                <p className="font-medium text-white">Simple application flow</p>
                <p className="mt-2">Candidates discover roles, apply, and track status with transparent communication.</p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-violet-300">Welcome</p>
              <h2 className="mt-2 text-3xl font-semibold text-white">{title}</h2>
              <p className="mt-2 text-sm text-slate-300">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AuthInput({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-200">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3.5 py-3 text-base text-white outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
      />
    </label>
  );
}

export function AuthButton({
  children,
  variant = "primary",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const styles =
    variant === "primary"
      ? "bg-violet-500 text-white hover:bg-violet-400"
      : "border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-500 hover:bg-slate-800";

  return (
    <button
      type="submit"
      className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition ${styles}`}
    >
      {children}
    </button>
  );
}
