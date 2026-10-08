import { ITThemePalette, ITThemeProvider } from "@axzydev/axzy_ui_system";
import "@axzydev/axzy_ui_system/dist/index.css";
import "@shared/i18n/config";
import { store } from "@app/store";
import ToastProvider from "@app/toast/ToastProvider";
import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "@app/index.css";

if (!localStorage.getItem("it-theme-dark-mode")) {
  localStorage.setItem("it-theme-dark-mode", "light");
}

const customTheme: ITThemePalette = {
  primary: "#1D4ED8",
  secondary: "#2563EB",
  ternary: "#EFF6FF",
  alert: "#F59E0B",
  warning: "#F59E0B",
  danger: "#DC2626",
  info: "#0EA5E9",
  success: "#16A34A",
  layout: {
    sidebarBg: "#ffffff",
    sidebarText: "#334155",
    navbarBg: "#1D4ED8",
    navbarText: "#ffffff",
  },
  table: {
    headerBg: "#dbeafe9d",
    headerText: "#1D4ED8",
    rowBg: "#ffffff",
    rowText: "#0F172A",
    rowHover: "#1d4ed8c4",
  },
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ITThemeProvider theme={customTheme} showFab={false} density={1}>
        <ToastProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </ToastProvider>
      </ITThemeProvider>
    </Provider>
  </React.StrictMode>
);
