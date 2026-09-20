import Link from "next/link";
import { GAUNTLET_MODES } from "@/lib/site";

export default function HomeWelcome() {
  return (
    <section>
      <h1 className="text-ink">God Gamer Gauntlet</h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
        Draft 3, 5, or 7 full games from these 19, speedrun them start to
        finish, and post the Clear.
      </p>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faint">
        A solo speedrun gauntlet — not a multiplayer win-streak.
      </p>
      <ul className="mt-6 flex flex-wrap gap-2 text-sm">
        {GAUNTLET_MODES.map((mode) => (
          <li
            key={mode.id}
            className={`rounded-full px-3.5 py-1.5 ${mode.chip}`}
          >
            <span className="font-medium">{mode.label}</span>
            <span className="opacity-70"> · {mode.games} games</span>
          </li>
        ))}
      </ul>
      <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <Link
          href="/how"
          className="bg-banner px-5 py-2.5 transition hover:bg-banner/90"
        >
          How it works
        </Link>
        <Link href="/records" className="text-muted underline-offset-4 hover:text-ink hover:underline">
          See the 19 games
        </Link>
        <Link href="/draft" className="text-muted underline-offset-4 hover:text-ink hover:underline">
          Draft a lineup
        </Link>
      </div>
    </section>
  );
}
