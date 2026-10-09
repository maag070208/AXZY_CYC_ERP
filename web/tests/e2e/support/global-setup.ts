import { execFileSync } from "node:child_process";
import { API_ROOT } from "./env";

/**
 * Provisiona los usuarios fijos de la suite (`e2e_admin`, `e2e_control`,
 * `e2e_profesor`) delegando en el paquete `api/`, dueño de la base. A
 * diferencia de la limpieza, aquí un fallo SÍ tumba la corrida: sin usuarios
 * ningún test de sesión tiene sentido.
 */
export default async function globalSetup(): Promise<void> {
  const output = execFileSync("npm", ["run", "--silent", "test:e2e:provision"], {
    cwd: API_ROOT,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log(output.trim());
}
