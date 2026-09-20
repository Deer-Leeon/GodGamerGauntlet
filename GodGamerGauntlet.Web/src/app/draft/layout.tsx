import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Draft",
  description:
    "Build a 3, 5, or 7 game speedrun lineup from the 19-game roster. Sign in only to start the clock.",
};

export default function DraftLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
