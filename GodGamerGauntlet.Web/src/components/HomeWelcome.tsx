import Link from "next/link";

const GRIND = [
  "You pick 10 different online multiplayer games, and the order.",
  "You win one game of each, in that order.",
  "At least 2 of the games are battle royales.",
  "One loss voids the run. You start over from the first game.",
  "You play at your level. Beating much weaker players on purpose does not count.",
];

const STREAM = [
  "You may queue one battle royale with more players on your side. (Fall Guys)",
  "You may back out because your opponents are too good. That does not restart the run. (Brawl Stars, Geoguessr)",
  "If you enter a lobby and win, that win counts. If you lose, you may reset that game. (Mario Kart)",
  "You may back out if you suspect someone in the lobby is stream sniping. That does not restart the run.",
  "If a stream sniper is helping you, you may continue without resetting the game.",
];

export default function HomeWelcome() {
  return (
    <section className="mx-auto max-w-3xl text-center">
      <p className="font-pixel text-[10px] leading-6 text-banner">
        THE CHALLENGE
      </p>
      <h1 className="mt-3 text-ink">God Gamer Gauntlet</h1>
      <div className="mx-auto mt-3 h-1.5 w-28 bg-banner" />
      <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted">
        Ludwig came up with the God Gamer Challenge.
        <br />
        Win 10 different online games in a row.
      </p>
      <details className="group mt-4 text-left">
        <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-2 text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden
            className="font-pixel text-[10px] leading-5 text-banner group-open:hidden"
          >
            +
          </span>
          <span
            aria-hidden
            className="hidden font-pixel text-[10px] leading-5 text-banner group-open:inline"
          >
            −
          </span>
          The rules
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <article className="border-2 border-ink/15 bg-white px-4 py-5">
            <h2 className="text-base text-ink">The grind</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              For you, off stream. These are the rules the runs started with.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
              {GRIND.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </article>
          <article className="border-2 border-ink/15 bg-white px-4 py-5">
            <h2 className="text-base text-ink">If you are streaming</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Later updates, so a streamed attempt can deal with stream
              sniping. They are not part of the grind.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
              {STREAM.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </article>
        </div>
        <p className="mt-4 text-center text-sm">
          <Link href="/how" className="text-banner hover:underline">
            How it works
          </Link>
        </p>
      </details>
    </section>
  );
}
