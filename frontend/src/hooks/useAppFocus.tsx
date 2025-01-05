import { useEffect, useCallback } from "react";

import { useAppState } from "~/store";

const useAppFocus = () => {
  const appFocus = useAppState((state) => state.appFocus);
  const setAppFocus = useAppState((state) => state.setAppFocus);

  // Function to execute when the web app loses focus
  const handleBlur = useCallback(() => {
    console.log("The web app has lost focus.");
    setAppFocus({
      panel: appFocus?.panel,
      isFocused: false,
    });
  }, [appFocus, setAppFocus]);

  // Function to execute when the web app regains focus
  const handleFocus = useCallback(() => {
    console.log("The web app has regained focus.");
    setAppFocus({
      panel: appFocus?.panel,
      isFocused: true,
    });
  }, [appFocus, setAppFocus]);

  useEffect(() => {
    handleBlur();
    handleFocus();

    // Attach event listeners to the window
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      // Remove event listeners when the component is unmounted
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [handleBlur, handleFocus]);
};

export default useAppFocus;
