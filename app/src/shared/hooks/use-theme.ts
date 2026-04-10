import { useEffect } from "react";

import { readTheme } from "@/shared/api/invoke";
import type { ThemeAppearance, ThemeData } from "@/shared/api/types";
import {
  useThemeName,
  useUIActions,
} from "@/features/settings/store/use-ui-store";
import { THEME_COLOR_KEYS } from "@/shared/theme/schema";

const CACHE_KEY = "comet-theme-cache";
const DEFAULT_UI_FONT = '"Figtree Variable", sans-serif';

function applyTheme(
  theme: Pick<ThemeData, "appearance" | "colors" | "uiFont">,
) {
  const root = document.documentElement;
  root.style.colorScheme = theme.appearance;
  root.style.setProperty("--ui-font", theme.uiFont);
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${key}`, value);
  }
}

function clearTheme() {
  const root = document.documentElement;
  root.style.removeProperty("color-scheme");
  root.style.removeProperty("--ui-font");
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
      uiFont?: unknown;
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
      uiFont:
        typeof parsed.uiFont === "string" && parsed.uiFont.trim().length > 0
          ? parsed.uiFont
          : DEFAULT_UI_FONT,
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
  const themeName = useThemeName();
  const { setThemeName } = useUIActions();

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
