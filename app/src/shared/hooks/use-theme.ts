import { useEffect } from "react";

import { readTheme } from "@/shared/api/invoke";
import type { ThemeAppearance, ThemeData } from "@/shared/api/types";
import { useUIStore } from "@/features/settings/store/use-ui-store";
import { THEME_COLOR_KEYS } from "@/shared/theme/schema";

const CACHE_KEY = "comet-theme-cache";

function applyTheme(theme: Pick<ThemeData, "appearance" | "colors">) {
  const root = document.documentElement;
  root.style.colorScheme = theme.appearance;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${key}`, value);
  }
}

function clearTheme() {
  const root = document.documentElement;
  root.style.removeProperty("color-scheme");
  for (const key of THEME_COLOR_KEYS) {
    root.style.removeProperty(`--${key}`);
  }
}

function isThemeAppearance(value: unknown): value is ThemeAppearance {
  return value === "dark" || value === "light";
}

function readCachedTheme() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as {
      appearance?: unknown;
      colors?: unknown;
    };

    if (
      !isThemeAppearance(parsed.appearance) ||
      typeof parsed.colors !== "object" ||
      parsed.colors === null
    ) {
      return null;
    }

    return {
      appearance: parsed.appearance,
      colors: parsed.colors as Record<string, string>,
    };
  } catch {
    return null;
  }
}

// Apply cached theme synchronously on module load to prevent FOUC.
// The effect will always re-fetch from disk and update the cache,
// so stale cache data only lasts until the first IPC round-trip.
const initialTheme = readCachedTheme();
if (initialTheme) {
  applyTheme(initialTheme);
}

export function useTheme() {
  const themeName = useUIStore((s) => s.themeName);
  const setThemeName = useUIStore((s) => s.setThemeName);

  useEffect(() => {
    if (themeName == null) {
      clearTheme();
      localStorage.removeItem(CACHE_KEY);
      return;
    }

    let cancelled = false;

    readTheme(themeName)
      .then((theme) => {
        if (cancelled) return;

        clearTheme();
        applyTheme(theme);

        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(theme));
        } catch {
          // Ignore storage errors.
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearTheme();
          localStorage.removeItem(CACHE_KEY);
          setThemeName(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [themeName, setThemeName]);
}
