"use client";

import * as React from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("reckon-theme", next ? "dark" : "light");
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="Toggle theme"
      className="inline-flex h-[30px] w-[34px] items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

/** Inline script for the document <head> to set the theme before paint (no flash). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('reckon-theme');if(t==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();`;
