import { useEffect, useState } from "react";

import { useTheme } from "~/components/theme/ThemeProvider";

/**
 * Custom React hook that tracks changes in the system's preferred color scheme.
 * @param {Function} onChangeCallback - A callback function that fires when the color scheme changes.
 * @returns The current preferred color scheme ('dark' or 'light').
 */
function useColorSchemeChange(onChangeCallback?: (scheme: string) => void) {
  const { setTheme } = useTheme();
  const [preferredScheme, setPreferredScheme] = useState(getPreferredScheme());

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const newScheme = e.matches ? "dark" : "light";
      setTheme(newScheme);
      setPreferredScheme(newScheme);
      if (onChangeCallback) {
        onChangeCallback(newScheme);
      }
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [onChangeCallback, setTheme]);

  return preferredScheme;
}

function getPreferredScheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default useColorSchemeChange;
