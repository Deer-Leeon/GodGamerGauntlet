"use client";

import { useLayoutEffect } from "react";
import { applyChromeClasses } from "@/lib/chromeBoot";

/** Restores rail padding after hydrate, then turns transitions on. */
export default function ChromeReady() {
  useLayoutEffect(() => {
    applyChromeClasses();
    const html = document.documentElement;
    const id = requestAnimationFrame(() => {
      html.classList.add("ggg-chrome-ready");
      html.classList.remove("ggg-chrome-booting");
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return null;
}
