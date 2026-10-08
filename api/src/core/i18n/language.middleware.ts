import type { NextFunction, Request, Response } from "express";
import {
  DEFAULT_LANGUAGE,
  languageFromHeader,
  runWithLanguage,
  systemLanguage,
} from "./index";

/** Fija el idioma de la petición (`Accept-Language` → idioma del sistema). */
export const languageMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const fromHeader = languageFromHeader(req.headers["accept-language"]);
  if (fromHeader) {
    runWithLanguage(fromHeader, next);
    return;
  }
  systemLanguage().then(
    (lng) => runWithLanguage(lng, next),
    () => runWithLanguage(DEFAULT_LANGUAGE, next)
  );
};
