import path from "node:path";
import dotenv from "dotenv";

// Los tests corren contra la API real; reutilizamos el mismo .env del servidor.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const PORT = process.env.PORT ?? "4000";

/** Todo lo que crea la suite lleva este prefijo, para limpiar sin tocar datos reales. */
export const E2E_PREFIX = "e2e_";

const API_URL = process.env.E2E_API_URL ?? `http://localhost:${PORT}/api/v1`;

export const E2E = {
  apiUrl: API_URL,
  /** Con barra final: las rutas de los tests son relativas a /api/v1/. */
  baseURL: `${API_URL.replace(/\/+$/, "")}/`,
  healthUrl: `${API_URL.replace(/\/+$/, "")}/health`,
  prefix: E2E_PREFIX,
  password: process.env.E2E_PASSWORD ?? "e2e-Test-2026!",
  admin: { username: "e2e_admin", name: "E2E Admin", role: "ADMIN" as const },
  student: { username: "e2e_alumno", name: "E2E Alumno", role: "STUDENT" as const },
};

/**
 * La suite escribe y borra filas reales. Cortamos si `DATABASE_URL` no apunta a
 * una base local, salvo que se pida explícitamente lo contrario.
 */
export const assertSafeDatabase = (): void => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida (revisa api/.env)");
  if (process.env.E2E_ALLOW_REMOTE_DB === "1") return;

  const host = new URL(url).hostname;
  const isLocal = ["localhost", "127.0.0.1", "::1", "postgres", "db"].includes(host);
  if (!isLocal) {
    throw new Error(
      `Los tests E2E escriben y borran datos: se esperaba una base local y DATABASE_URL apunta a "${host}". ` +
        `Si es intencional, exporta E2E_ALLOW_REMOTE_DB=1.`
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("No se ejecutan los tests E2E con NODE_ENV=production");
  }
};

/** Sufijo único por corrida, para que usuarios/correos nunca choquen. */
export const newRunId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toLowerCase();
