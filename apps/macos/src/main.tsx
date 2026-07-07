import React from "react";
import ReactDOM from "react-dom/client";
import { Web3AuthProvider } from "./web3auth";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Web3AuthProvider>
      <App />
    </Web3AuthProvider>
  </React.StrictMode>
);
