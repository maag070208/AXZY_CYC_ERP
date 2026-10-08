import { execFileSync } from "node:child_process";
import { API_ROOT } from "./env";

/**
 * Borra lo que creó la suite delegando en el paquete `api/`, que es el dueño
 * de la base y ya resuelve el alcance por el prefijo `E2E`. Si no se puede
 * (porque se corre sin el repo de la API al lado), avisa y no tumba la corrida:
 * los tests ya pasaron y lo único que queda es basura en una base de desarrollo.
 */
export default async function globalTeardown(): Promise<void> {
  try {
    const output = execFileSync("npm", ["run", "--silent", "test:e2e:clean"], {
      cwd: API_ROOT,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    console.log(output.trim());
  } catch (err) {
    console.warn(
      `[e2e] no se pudo limpiar la base desde ${API_ROOT}; ` +
        `corre ahí "npm run test:e2e:clean" a mano. ` +
        `${err instanceof Error ? err.message : String(err)}`
    );
  }
}
