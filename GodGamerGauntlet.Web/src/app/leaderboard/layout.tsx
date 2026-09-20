import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Boards",
  description:
    "Sprint, Marathon, and Endurance boards. Best Clears, this month, and furthest DNF.",
};

export default function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
