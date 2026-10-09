import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import auditEn from "./locales/en/audit.json";
import authEn from "./locales/en/auth.json";
import commonEn from "./locales/en/common.json";
import configEn from "./locales/en/config.json";
import rolesEn from "./locales/en/roles.json";
import usersEn from "./locales/en/users.json";

import auditEs from "./locales/es/audit.json";
import authEs from "./locales/es/auth.json";
import commonEs from "./locales/es/common.json";
import configEs from "./locales/es/config.json";
import rolesEs from "./locales/es/roles.json";
import usersEs from "./locales/es/users.json";

export const defaultNS = "common" as const;

export const APP_LANGUAGES = ["es", "en"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const NS_LIST = ["common", "auth", "users", "roles", "audit", "config"] as const;

export const resources = {
  en: {
    common: commonEn,
    auth: authEn,
    users: usersEn,
    roles: rolesEn,
    audit: auditEn,
    config: configEn,
  },
  es: {
    common: commonEs,
    auth: authEs,
    users: usersEs,
    roles: rolesEs,
    audit: auditEs,
    config: configEs,
  },
} as const;

const STORAGE_KEY = "cyc-language";

const storedLanguage =
  typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;

i18n.use(initReactI18next).init({
  resources,
  lng: storedLanguage ?? "es",
  fallbackLng: "es",
  defaultNS,
  ns: NS_LIST,
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on("languageChanged", (lng) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, lng);
  }
});

export default i18n;
