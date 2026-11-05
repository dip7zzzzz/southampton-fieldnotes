import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import IllustratedAtlas from "./IllustratedAtlas";
import "./styles.css";
import "./atlas.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).get("view") === "illustration" ? (
      <IllustratedAtlas />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
