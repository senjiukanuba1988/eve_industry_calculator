import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { detectRuntime } from "./storage/runtime";
import { App } from "./ui/App";
import "./ui/global.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App runtime={detectRuntime()} />
  </StrictMode>,
);
