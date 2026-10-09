import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import auditEn from "./locales/en/audit.json";
import authEn from "./locales/en/auth.json";
import commonEn from "./locales/en/common.json";
import configEn from "./locales/en/config.json";
import rolesEn from "./locales/en/roles.json";
import studentsEn from "./locales/en/students.json";
import teachersEn from "./locales/en/teachers.json";
import documentsEn from "./locales/en/documents.json";
import usersEn from "./locales/en/users.json";
import coursesEn from "./locales/en/courses.json";
import gradesEn from "./locales/en/grades.json";
import financeEn from "./locales/en/finance.json";
import reportsEn from "./locales/en/reports.json";
import examsEn from "./locales/en/exams.json";
import attendanceEn from "./locales/en/attendance.json";
import notificationsEn from "./locales/en/notifications.json";
import migrationEn from "./locales/en/migration.json";
import programsEn from "./locales/en/programs.json";

import auditEs from "./locales/es/audit.json";
import authEs from "./locales/es/auth.json";
import commonEs from "./locales/es/common.json";
import configEs from "./locales/es/config.json";
import rolesEs from "./locales/es/roles.json";
import studentsEs from "./locales/es/students.json";
import teachersEs from "./locales/es/teachers.json";
import documentsEs from "./locales/es/documents.json";
import usersEs from "./locales/es/users.json";
import coursesEs from "./locales/es/courses.json";
import gradesEs from "./locales/es/grades.json";
import financeEs from "./locales/es/finance.json";
import reportsEs from "./locales/es/reports.json";
import examsEs from "./locales/es/exams.json";
import attendanceEs from "./locales/es/attendance.json";
import notificationsEs from "./locales/es/notifications.json";
import migrationEs from "./locales/es/migration.json";
import programsEs from "./locales/es/programs.json";

export const defaultNS = "common" as const;

export const APP_LANGUAGES = ["es", "en"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const NS_LIST = ["common", "auth", "users", "roles", "audit", "config", "students", "teachers", "documents", "courses", "grades", "finance", "reports", "exams", "attendance", "notifications", "migration", "programs"] as const;

export const resources = {
  en: {
    common: commonEn,
    auth: authEn,
    users: usersEn,
    roles: rolesEn,
    audit: auditEn,
    config: configEn,
    students: studentsEn,
    teachers: teachersEn,
    documents: documentsEn,
    courses: coursesEn,
    grades: gradesEn,
    finance: financeEn,
    reports: reportsEn,
    exams: examsEn,
    attendance: attendanceEn,
    notifications: notificationsEn,
    migration: migrationEn,
    programs: programsEn,
  },
  es: {
    common: commonEs,
    auth: authEs,
    users: usersEs,
    roles: rolesEs,
    audit: auditEs,
    config: configEs,
    students: studentsEs,
    teachers: teachersEs,
    documents: documentsEs,
    courses: coursesEs,
    grades: gradesEs,
    finance: financeEs,
    reports: reportsEs,
    exams: examsEs,
    attendance: attendanceEs,
    notifications: notificationsEs,
    migration: migrationEs,
    programs: programsEs,
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
