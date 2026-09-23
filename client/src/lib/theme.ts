import { useEffect, useState } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const THEME_KEY = 'mc_theme';
const META_THEME = document.querySelector('meta[name="theme-color"]');

export function getThemePref(): ThemePref {
  const raw = localStorage.getItem(THEME_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export function getSystemDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function applyDark(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
  if (META_THEME) {
    META_THEME.setAttribute('content', dark ? '#0f172a' : '#f1f5f9');
  }
}

export function setThemePref(pref: ThemePref): void {
  localStorage.setItem(THEME_KEY, pref);
  applyDark(pref === 'dark' || (pref === 'system' && getSystemDark()));
}

export function initTheme(): void {
  const pref = getThemePref();
  localStorage.setItem(THEME_KEY, pref);
  applyDark(pref === 'dark' || (pref === 'system' && getSystemDark()));
}

export function useTheme(): {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  systemDark: boolean;
} {
  const [pref, setPrefState] = useState<ThemePref>(getThemePref);
  const [systemDark, setSystemDark] = useState<boolean>(getSystemDark);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const onChange = () => {
      const sys = media.matches;
      setSystemDark(sys);
      if (getThemePref() === 'system') applyDark(sys);
    };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    setThemePref(p);
  };

  return { pref, setPref, systemDark };
}