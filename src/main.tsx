/// <reference types="vite/client" />
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./overrides.css";
import "./management.css";
import "./features.css";

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
