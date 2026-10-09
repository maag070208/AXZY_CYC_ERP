import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env as config } from "@core/config/env.config";
import { isOriginAllowed, parseCorsOrigins } from "@core/config/cors";
import { errorMiddleware, notFoundMiddleware } from "@core/middlewares/error.middleware";
import { setupSwagger } from "@core/swagger/setup";
import { languageMiddleware } from "@core/i18n/language.middleware";
import apiRouter from "@modules/api.router";

export const createApp = () => {
  const app = express();
  // IP real del cliente detrás de nginx/Railway (la usa el límite de peticiones).
  app.set("trust proxy", config.TRUST_PROXY);
  // `WEB_ORIGIN` admite lista separada por comas y comodines (p. ej. `https://*.axzy.dev`).
  const corsPolicy = parseCorsOrigins(config.WEB_ORIGIN);

  app.use([
    cors({
      origin: (origin, callback) => callback(null, isOriginAllowed(origin, corsPolicy)),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
    express.json({ limit: "1mb" }),
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: false,
    }),
    morgan(config.NODE_ENV === "development" ? "dev" : "combined"),
  ]);

  setupSwagger(app);

  // Idioma de la respuesta: Accept-Language → idioma del sistema → es.
  app.use("/api/v1", languageMiddleware, apiRouter);

  app.get("/", (_req, res) => {
    res.json({ name: "cyc-api", version: "1.0.0", docs: "/docs" });
  });

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};
