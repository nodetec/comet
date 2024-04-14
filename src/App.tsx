import "./styles/globals.css";

import { useEffect } from "react";

import { Route, Routes } from "react-router-dom";

import { Toaster } from "./components/ui/sonner";
import { useContextMenuEvent } from "./hooks/useContextMenuEvent";
import useThemeChange from "./hooks/useThemeChange";
import HomePage from "./pages/HomePage";

function App() {
  const handleThemeChange = (theme: string) => {
    console.log("theme changed");
    console.log("THEME", theme);
  };

  useThemeChange(handleThemeChange);
  useContextMenuEvent();

  useEffect(() => {
    localStorage.setItem("vite-ui-theme", "system");
  }, []);

  return (
    <>
      <Routes>
        {/* <Route element={<Layout />}> */}
        <Route path="/" element={<HomePage />} />
        {/* <Route path="/u/:npub" element={<UserPage />} /> */}
        {/* </Route> */}
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
