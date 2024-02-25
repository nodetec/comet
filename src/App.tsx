import { useState } from "react";

import { invoke } from "@tauri-apps/api/core";

import "./styles/globals.css";

import { Route, Routes } from "react-router-dom";

import { Toaster } from "./components/ui/sonner";
import Layout from "./layouts/Layout";
import HomePage from "./pages/HomePage";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
    setGreetMsg(await invoke("greet", { name }));
  }

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
