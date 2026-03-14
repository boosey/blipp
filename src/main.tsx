import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppClerkProvider } from "./providers/clerk-provider";
import App from "./App";
import { Toaster } from "./components/toaster";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppClerkProvider>
        <App />
        <Toaster />
      </AppClerkProvider>
    </BrowserRouter>
  </StrictMode>
);
