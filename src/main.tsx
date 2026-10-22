import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import BootErrorBoundary from "./pages/BootErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BootErrorBoundary>
      <App />
    </BootErrorBoundary>
  </React.StrictMode>,
);
