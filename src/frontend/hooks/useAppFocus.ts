import { useCallback, useEffect } from "react";

import { useAppState } from "~/store";

const useAppFocus = () => {
  const appFocus = useAppState((state) => state.appFocus);
  const setAppFocus = useAppState((state) => state.setAppFocus);

  // Function to execute when the web app loses focus
  const handleBlur = useCallback(() => {
    // console.log("The web app has lost focus.");
    setAppFocus({
      panel: appFocus?.panel,
      isFocused: false,
    });
  }, [appFocus?.panel, setAppFocus]);

  // Function to execute when the web app regains focus
  const handleFocus = useCallback(() => {
    // console.log("The web app has regained focus.");
    setAppFocus({
      panel: appFocus?.panel,
      isFocused: true,
    });
  }, [appFocus?.panel, setAppFocus]);

  useEffect(() => {
    // Set initial focus state based on current document focus
    setAppFocus({
      panel: appFocus?.panel,
      isFocused: document.hasFocus(),
    });

    // Attach event listeners to the window
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      // Remove event listeners when the component is unmounted
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [handleBlur, handleFocus, appFocus?.panel, setAppFocus]);
};

export default useAppFocus;
