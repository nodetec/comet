import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

import { useUIStore } from "@/stores/use-ui-store";

type ThemeData = {
  name: string;
  colors: Record<string, string>;
};

const CACHE_KEY = "comet-theme-cache";

function applyColors(colors: Record<string, string>) {
  const root = document.documentElement;
  const keys: string[] = [];
  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(`--${key}`, value);
    keys.push(key);
  }
  return keys;
}

function clearColors(keys: string[]) {
  const root = document.documentElement;
  for (const key of keys) {
    root.style.removeProperty(`--${key}`);
  }
}

// Apply cached theme synchronously on module load to prevent FOUC.
// The effect will always re-fetch from disk and update the cache,
// so stale cache data only lasts until the first IPC round-trip.
let initialKeys: string[] = [];
try {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    const { colors } = JSON.parse(cached);
    initialKeys = applyColors(colors);
  }
} catch {
  // Ignore — will apply via effect
}

export function useTheme() {
  const themeName = useUIStore((s) => s.themeName);
  const setThemeName = useUIStore((s) => s.setThemeName);
  const appliedKeysRef = useRef<string[]>(initialKeys);

  useEffect(() => {
    if (themeName === "default") {
      clearColors(appliedKeysRef.current);
      appliedKeysRef.current = [];
      localStorage.removeItem(CACHE_KEY);
      return;
    }

    let cancelled = false;

    invoke<ThemeData>("read_theme", { themeId: themeName })
      .then((theme) => {
        if (cancelled) return;

        // Clear old keys and apply fresh from disk
        clearColors(appliedKeysRef.current);
        appliedKeysRef.current = applyColors(theme.colors);

        // Update cache for next startup
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ id: themeName, colors: theme.colors }),
          );
        } catch {
          // Ignore storage errors
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearColors(appliedKeysRef.current);
          appliedKeysRef.current = [];
          localStorage.removeItem(CACHE_KEY);
          setThemeName("default");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [themeName, setThemeName]);
}
