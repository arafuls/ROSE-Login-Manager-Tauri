/** Browser entry point: mounts the React app into #root (see index.html). */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
