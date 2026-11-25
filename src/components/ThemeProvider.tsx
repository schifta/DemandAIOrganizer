"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type ThemeMode = "light" | "dark";
export const FONT_SCALES = ["87.5%", "100%", "112.5%", "125%"] as const;
export type FontScale = (typeof FONT_SCALES)[number];

const THEME_STORAGE_KEY = "eco_theme";
const FONT_STORAGE_KEY = "eco_font_scale";
const SOUND_STORAGE_KEY = "eco_sound_enabled";

interface PreferencesContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  fontScale: FontScale;
  increaseFont: () => void;
  decreaseFont: () => void;
  resetFont: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(
  undefined
);

function isValidFontScale(value: string | null): value is FontScale {
  return (
    value !== null && (FONT_SCALES as readonly string[]).includes(value)
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [fontScale, setFontScale] = useState<FontScale>("100%");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const initialTheme: ThemeMode = savedTheme === "dark" ? "dark" : "light";

    const savedScale = localStorage.getItem(FONT_STORAGE_KEY);
    const initialScale: FontScale = isValidFontScale(savedScale)
      ? savedScale
      : "100%";

    const savedSound = localStorage.getItem(SOUND_STORAGE_KEY);
    const initialSound = savedSound === "false" ? false : true;

    setTheme(initialTheme);
    setFontScale(initialScale);
    setSoundEnabled(initialSound);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, mounted]);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.style.fontSize = fontScale;
    localStorage.setItem(FONT_STORAGE_KEY, fontScale);
  }, [fontScale, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(SOUND_STORAGE_KEY, String(soundEnabled));
  }, [soundEnabled, mounted]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => !prev);
  }, []);

  const increaseFont = useCallback(() => {
    setFontScale((prev) => {
      const idx = FONT_SCALES.indexOf(prev);
      return idx < FONT_SCALES.length - 1 ? FONT_SCALES[idx + 1] : prev;
    });
  }, []);

  const decreaseFont = useCallback(() => {
    setFontScale((prev) => {
      const idx = FONT_SCALES.indexOf(prev);
      return idx > 0 ? FONT_SCALES[idx - 1] : prev;
    });
  }, []);

  const resetFont = useCallback(() => {
    setFontScale("100%");
  }, []);

  return (
    <PreferencesContext.Provider
      value={{
        theme,
        toggleTheme,
        fontScale,
        increaseFont,
        decreaseFont,
        resetFont,
        soundEnabled,
        toggleSound,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences deve ser usado dentro de ThemeProvider");
  }
  return ctx;
}
