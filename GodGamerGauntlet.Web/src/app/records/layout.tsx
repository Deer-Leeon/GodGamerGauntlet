import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Games",
  description:
    "The 19-game God Gamer Gauntlet roster and per-game baseline times.",
};

export default function RecordsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
