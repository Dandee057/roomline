// First: the catalogue editor's products must exist before the saved plan that may use them is read
import "./admin/catalogueStore.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./style.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
