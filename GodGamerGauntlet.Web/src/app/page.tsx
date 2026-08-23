import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <p className="font-heading text-sm uppercase tracking-[0.4em] text-accent-streak">
        godgamergauntlet.com
      </p>
      <h1 className="font-heading text-5xl font-bold leading-tight sm:text-6xl">
        Ten games. One run.
        <br />
        <span className="text-accent-win">Zero excuses.</span>
      </h1>
      <p className="max-w-xl text-lg text-gray-400">
        Draft a 10-game gauntlet where every slot multiplies the difficulty.
        Survive all ten and claim the title of God Gamer.
      </p>
      <Link
        href="/draft"
        className="rounded-xl bg-accent-streak px-10 py-4 font-heading text-xl font-bold text-dark transition hover:brightness-110"
      >
        Enter the Draft Room
      </Link>
    </main>
  );
}
