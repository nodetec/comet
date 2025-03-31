"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const store_1 = require("~/store");
const useAppFocus = () => {
    const appFocus = (0, store_1.useAppState)((state) => state.appFocus);
    const setAppFocus = (0, store_1.useAppState)((state) => state.setAppFocus);
    // Function to execute when the web app loses focus
    const handleBlur = (0, react_1.useCallback)(() => {
        // console.log("The web app has lost focus.");
        setAppFocus({
            panel: appFocus === null || appFocus === void 0 ? void 0 : appFocus.panel,
            isFocused: false,
        });
    }, [appFocus === null || appFocus === void 0 ? void 0 : appFocus.panel, setAppFocus]);
    // Function to execute when the web app regains focus
    const handleFocus = (0, react_1.useCallback)(() => {
        // console.log("The web app has regained focus.");
        setAppFocus({
            panel: appFocus === null || appFocus === void 0 ? void 0 : appFocus.panel,
            isFocused: true,
        });
    }, [appFocus === null || appFocus === void 0 ? void 0 : appFocus.panel, setAppFocus]);
    (0, react_1.useEffect)(() => {
        // Set initial focus state based on current document focus
        setAppFocus({
            panel: appFocus === null || appFocus === void 0 ? void 0 : appFocus.panel,
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
    }, [handleBlur, handleFocus, appFocus === null || appFocus === void 0 ? void 0 : appFocus.panel, setAppFocus]);
};
exports.default = useAppFocus;
//# sourceMappingURL=useAppFocus.js.map