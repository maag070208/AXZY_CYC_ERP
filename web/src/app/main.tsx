import { ITThemePalette, ITThemeProvider } from "@axzydev/axzy_ui_system";
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


// Lenguaje visual plano (D-053): superficies blancas con borde fino sobre un
// fondo gris claro, sin sombras; el azul de marca solo en acentos.
const customTheme: ITThemePalette = {
  primary: "#3056B8",
  secondary: "#27469B",
  ternary: "#EEF2FB",

  alert: "#F97316",
  warning: "#F59E0B",
  danger: "#DC2626",
  info: "#0EA5E9",
  success: "#16A34A",

  layout: {
    // La barra lateral comparte el fondo de la página; la superior es blanca.
    sidebarBg: "#F5F6FA",
    sidebarText: "#334155",
    navbarBg: "#FFFFFF",
    navbarText: "#1E293B",
  },

  table: {
    headerBg: "#F8FAFC",
    headerText: "#475569",
    rowBg: "#FFFFFF",
    rowText: "#1E293B",
    rowHover: "#F5F7FB",
  },
};
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ITThemeProvider theme={customTheme} showFab={false} density={1} appearance="flat" radius={10} shadow={1}>
        <ToastProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </ToastProvider>
      </ITThemeProvider>
    </Provider>
  </React.StrictMode>
);
