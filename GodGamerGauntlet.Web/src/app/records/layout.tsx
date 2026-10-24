import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Games",
  description:
    "The speedrun.com most-run and most-active games, and per-game baseline times.",
};

export default function RecordsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
