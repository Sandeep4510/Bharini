import Link from "next/link";

const metrics = [
  { label: "Verified artists", value: "18k+" },
  { label: "Production houses", value: "1.2k" },
  { label: "Casting calls", value: "4.8k" },
];

const opportunities = [
  "Verified artist profiles with portfolio proof",
  "Casting call publishing for studios and production teams",
  "Application workflows with transparent status tracking",
  "Secure messaging and moderation-ready infrastructure",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500 font-bold text-white">
            B
          </div>
          <span className="text-xl font-semibold tracking-tight">Bharini</span>
        </div>

        <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          <a href="#features" className="transition hover:text-white">Features</a>
          <a href="#platform" className="transition hover:text-white">Platform</a>
          <a href="#about" className="transition hover:text-white">About</a>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/auth/login" className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-900">
            Login
          </Link>
          <Link href="/auth/register" className="rounded-full bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400">
            Join now
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-8 md:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-6 inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-violet-200">
              Casting platform for artists
            </div>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Find the right role and the right artist faster.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-slate-300">
              Bharini is built for verified profiles, credible casting calls, and direct application workflows for creative talent and production teams.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/auth/register" className="rounded-full bg-violet-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-400">
                Create account
              </Link>
              <Link href="/auth/login" className="rounded-full border border-slate-700 bg-slate-900 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-800">
                Sign in
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-violet-950/20">
            <div className="rounded-2xl border border-slate-700 bg-slate-950 p-5">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Live role</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Fashion Film Assistant</h2>
                </div>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                  Open
                </span>
              </div>

              <div className="space-y-4 text-sm text-slate-300">
                <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 p-3">
                  <span>Location</span>
                  <span className="font-medium text-white">Mumbai</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 p-3">
                  <span>Compensation</span>
                  <span className="font-medium text-white">₹25,000 / day</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 p-3">
                  <span>Artist fit</span>
                  <span className="font-medium text-white">Dance + acting</span>
                </div>
              </div>

              <Link
                href="/auth/login"
                className="mt-6 block w-full rounded-xl bg-violet-500 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-violet-400"
              >
                Apply now
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-800 bg-slate-900/60">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <div className="text-3xl font-semibold text-white">{metric.value}</div>
              <div className="mt-2 text-sm text-slate-400">{metric.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-300">Why Bharini</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Built for genuine opportunities, not just vanity engagement.
          </h2>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {opportunities.map((item, index) => (
            <div key={item} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/15 text-sm font-semibold text-violet-200">
                0{index + 1}
              </div>
              <p className="text-base text-slate-200">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="platform" className="border-t border-slate-800 bg-slate-900/60">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-20 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-300">For artists</p>
            <h3 className="mt-4 text-3xl font-semibold text-white">Showcase your work and get discovered by the right teams.</h3>
            <ul className="mt-6 space-y-3 text-slate-300">
              <li>• Portfolio-first artist profiles with skills and languages</li>
              <li>• Search and filter castings by role, city, and type</li>
              <li>• Verified status and moderation-ready trust signals</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-300">For productions</p>
            <h3 className="mt-4 text-3xl font-semibold text-white">Publish casting calls and shortlist talent without the noise.</h3>
            <ul className="mt-6 space-y-3 text-slate-300">
              <li>• Role-based publishing and review workflows</li>
              <li>• Structured applicant tracking and status updates</li>
              <li>• Communication and moderation designed for safe outreach</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto max-w-6xl px-6 pb-24 pt-20">
        <div className="rounded-3xl border border-slate-800 bg-gradient-to-r from-violet-500/10 via-slate-900 to-slate-900 p-8 md:p-10">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-300">Start today</p>
              <h3 className="mt-4 text-3xl font-semibold text-white">Ready to build your next career move or your next casting?</h3>
            </div>
            <Link href="/auth/register" className="inline-flex rounded-full bg-violet-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-400">
              Join Bharini
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
