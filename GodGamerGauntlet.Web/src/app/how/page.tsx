import type { Metadata } from "next";
import Link from "next/link";

const UPDATED_RULES_URL =
  "https://www.reddit.com/r/LudwigAhgren/comments/1fkrxjn/god_gamer_challenge_updated_rules/";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Ludwig created the God Gamer Challenge. The grind is 10 online wins in a row. Streamers use a later version to deal with stream sniping.",
};

const GRIND = [
  "You pick 10 different online multiplayer games, and the order.",
  "You win one game of each, in that order.",
  "At least 2 of the games are battle royales.",
  "One loss voids the run. You start over from the first game.",
  "You play at your level. Beating much weaker players on purpose does not count.",
];

const STREAM = [
  "You may queue one battle royale with more players on your side. That raises your chance of winning. (Fall Guys)",
  "You may back out because your opponents are too good. That does not restart the run, and you can do it indefinitely. (Brawl Stars, Geoguessr)",
  "If you enter a lobby and win, that win counts. If you lose, the loss does not count, you may reset that game, and the run does not restart. (Mario Kart)",
  "You may back out of any game if you suspect someone in the lobby is stream sniping. That does not restart the run, and you can do it indefinitely. (Fall Guys, Mario Kart, Chess Bughouse, and many other games)",
  "If you suspect a stream sniper is helping you, you may continue without resetting the game or the run.",
];

export default function HowItWorksPage() {
  return (
    <main className="site-content flex-1 px-5 py-8 sm:px-7">
      <header className="pb-2">
        <p className="font-pixel text-[10px] leading-6 text-banner">
          THE CHALLENGE
        </p>
        <h1 className="mt-2">How it works</h1>
        <div className="mt-3 h-1.5 w-28 bg-banner" />
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
          Ludwig created the God Gamer Challenge. One version is the grind.
          The other is for when you stream it and have to deal with stream
          sniping.
        </p>
      </header>

      <ol className="mt-10 max-w-2xl space-y-5">
        <li className="border-2 border-ink/15 bg-white px-5 py-6">
          <p className="font-pixel text-[10px] leading-5 text-banner">
            STAGE 01
          </p>
          <h2 className="mt-2">Ludwig made it</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Ludwig came up with the God Gamer Challenge. The grind is how it
            started. The extra rules showed up later, once people were playing
            it on stream.
          </p>
        </li>

        <li className="border-2 border-ink/15 bg-white px-5 py-6">
          <p className="font-pixel text-[10px] leading-5 text-banner">
            STAGE 02
          </p>
          <h2 className="mt-2">The grind</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            For you, off stream. These are the rules the runs started with.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
            {GRIND.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </li>

        <li className="border-2 border-ink/15 bg-white px-5 py-6">
          <p className="font-pixel text-[10px] leading-5 text-banner">
            STAGE 03
          </p>
          <h2 className="mt-2">If you are streaming</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            These updates are only for a streamed attempt, so you can deal
            with stream sniping. They are not part of the grind. This summary
            follows{" "}
            <a
              href={UPDATED_RULES_URL}
              target="_blank"
              rel="noreferrer"
              className="text-banner hover:underline"
            >
              God Gamer Challenge — updated rules
            </a>
            .
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
            {STREAM.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </li>

        <li className="border-2 border-ink/15 bg-white px-5 py-6">
          <p className="font-pixel text-[10px] leading-5 text-banner">
            STAGE 04
          </p>
          <h2 className="mt-2">What that write-up argues</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Those extra rules are there because of stream sniping, and they
            put an asterisk on a streamed run. The same post says a stream
            delay is the fix: it makes it much harder for a sniper to queue
            into the lobby, so the challenge does not need another exception
            after a loss.
          </p>
        </li>

        <li className="border-2 border-ink/15 bg-white px-5 py-6">
          <p className="font-pixel text-[10px] leading-5 text-banner">
            STAGE 05
          </p>
          <h2 className="mt-2">This website</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The games displayed here show their verified speedrun.com runs.
            Each imported run links back to speedrun.com. The draft room is
            this site&apos;s own lineup tool. It is not Ludwig&apos;s 10-win
            challenge.
          </p>
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
            <Link
              href="/records"
              className="bg-banner px-4 py-2 transition hover:bg-banner/90"
            >
              See the games
            </Link>
            <Link
              href="/draft"
              className="text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Draft a lineup
            </Link>
          </p>
        </li>
      </ol>
    </main>
  );
}
