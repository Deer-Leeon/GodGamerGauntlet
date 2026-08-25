import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GGG Overlay",
};

/** Chrome-free shell so OBS captures only the wheel and timer. */
export default function OverlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
