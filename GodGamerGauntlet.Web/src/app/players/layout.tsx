import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Players",
  description: "Look up God Gamer Gauntlet players and their run history.",
};

export default function PlayersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
