import type { Metadata } from "next";
import Link from "next/link";
import { GAUNTLET_MODES } from "@/lib/site";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Pick Sprint, Marathon, or Endurance. Draft from 19 games. Speedrun them start to finish. Post the Clear.",
};

export default function HowItWorksPage() {
  return (
    <main className="site-content flex-1 px-5 py-8 sm:px-7">
      <header className="pb-2">
        <h1>How it works</h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">
          A solo speedrun gauntlet. Draft a lineup, run every game start to
          finish, and put the Clear on the boards.
        </p>
      </header>

      <ol className="mt-10 max-w-2xl space-y-5">
        <li className="rounded-xl bg-surface px-5 py-6 shadow-[0_1px_2px_rgb(42_36_28_/_0.08)]">
          <p className="text-sm font-medium text-banner">1</p>
          <h2 className="mt-1">Pick a length</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Sprint, Marathon, or Endurance. Harder lineups rank higher on the
            boards.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {GAUNTLET_MODES.map((mode) => (
              <li
                key={mode.id}
                className={`rounded-xl px-4 py-3 ${mode.chip}`}
              >
                <span className="font-medium">{mode.label}</span>
                <span className="opacity-70"> · {mode.games} games — </span>
                <span>{mode.blurb}</span>
              </li>
            ))}
          </ul>
        </li>

        <li className="rounded-xl bg-surface px-5 py-6 shadow-[0_1px_2px_rgb(42_36_28_/_0.08)]">
          <p className="text-sm font-medium text-banner">2</p>
          <h2 className="mt-1">Draft from the 19 games</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The catalog is closed. Build a lineup in the Draft Room — no
            account needed until you start the clock.
          </p>
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
            <Link
              href="/draft"
              className="bg-banner px-4 py-2 transition hover:bg-banner/90"
            >
              Draft a lineup
            </Link>
            <Link
              href="/records"
              className="text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Games
            </Link>
          </p>
        </li>

        <li className="rounded-xl bg-surface px-5 py-6 shadow-[0_1px_2px_rgb(42_36_28_/_0.08)]">
          <p className="text-sm font-medium text-banner">3</p>
          <h2 className="mt-1">Run start to finish</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Split when you beat a game. Use the site control deck, or download
            GGG Timer so Space and Enter still work over a fullscreen game. The
            website stores the run — it is the ledger, not the tick.
          </p>
          <p className="mt-4">
            <Link
              href="/timer"
              className="text-sm text-banner hover:underline"
            >
              Download GGG Timer
            </Link>
          </p>
        </li>

        <li className="rounded-xl bg-surface px-5 py-6 shadow-[0_1px_2px_rgb(42_36_28_/_0.08)]">
          <p className="text-sm font-medium text-banner">4</p>
          <h2 className="mt-1">Post the Clear</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Finish every game and the run lands on the feed and the boards. A
            DNF still counts for furthest survival.
          </p>
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
            <Link
              href="/leaderboard"
              className="text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Boards
            </Link>
            <Link
              href="/login?next=/draft"
              className="text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Create an account
            </Link>
          </p>
        </li>
      </ol>

      <section className="mt-14 max-w-2xl border-t border-ink/10 pt-8">
        <h2>Words used here</h2>
        <dl className="mt-4 space-y-4 text-sm leading-relaxed">
          <div>
            <dt className="text-ink">Clear</dt>
            <dd className="mt-1 text-muted">
              You beat every game in the lineup.
            </dd>
          </div>
          <div>
            <dt className="text-ink">DNF</dt>
            <dd className="mt-1 text-muted">
              Did not finish. The boards still track how far you got.
            </dd>
          </div>
          <div>
            <dt className="text-ink">Games</dt>
            <dd className="mt-1 text-muted">
              The 19-game roster, plus per-game baseline times.
            </dd>
          </div>
          <div>
            <dt className="text-ink">Boards</dt>
            <dd className="mt-1 text-muted">
              Gauntlet rankings for Sprint, Marathon, and Endurance.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
