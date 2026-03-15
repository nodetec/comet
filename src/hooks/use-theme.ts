import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

import { useUIStore } from "@/stores/use-ui-store";

type ThemeData = {
  name: string;
  colors: Record<string, string>;
};

export function useTheme() {
  const themeName = useUIStore((s) => s.themeName);
  const setThemeName = useUIStore((s) => s.setThemeName);
  const appliedKeysRef = useRef<string[]>([]);

  useEffect(() => {
    const root = document.documentElement;

    // Clear previously applied theme variables
    for (const key of appliedKeysRef.current) {
      root.style.removeProperty(`--${key}`);
    }
    appliedKeysRef.current = [];
    document.body.style.removeProperty("background");

    if (themeName === "default") {
      return;
    }

    let cancelled = false;

    invoke<ThemeData>("read_theme", { themeId: themeName })
      .then((theme) => {
        if (cancelled) return;

        const keys: string[] = [];
        for (const [key, value] of Object.entries(theme.colors)) {
          root.style.setProperty(`--${key}`, value);
          keys.push(key);
        }
        appliedKeysRef.current = keys;

        if (theme.colors.background) {
          document.body.style.background = theme.colors.background;
        }
      })
      .catch(() => {
        // Theme file missing or invalid — fall back to default
        if (!cancelled) {
          setThemeName("default");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [themeName, setThemeName]);
}
