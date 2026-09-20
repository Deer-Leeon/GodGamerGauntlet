import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in or create an account to start a God Gamer Gauntlet.",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
          <p className="text-sm text-faint">Loading…</p>
        </main>
      }
    >
      {children}
    </Suspense>
  );
}
