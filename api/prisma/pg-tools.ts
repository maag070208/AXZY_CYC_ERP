import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";

/**
 * Utilidades compartidas por `backup.ts` y `restore.ts`: ejecutan las
 * herramientas de Postgres con el binario local si existe y, si no, dentro del
 * contenedor de docker-compose (`docker exec`).
 */

export interface Target {
  user: string;
  password: string;
  database: string;
  host: string;
  port: string;
}

export const DEFAULT_CONTAINER = "cyc-postgres";

export const mask = (url: string): string => url.replace(/:\/\/([^:]*):[^@]*@/, "://$1:***@");

export const parseTarget = (url: string): Target => {
  const parsed = new URL(url);
  return {
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    host: parsed.hostname,
    port: parsed.port || "5432",
  };
};

export const isLocalHost = (target: Target): boolean =>
  /^(localhost|127\.0\.0\.1|::1|host\.docker\.internal)$/.test(target.host);

interface RunOptions {
  env?: NodeJS.ProcessEnv;
  stdin?: Readable;
  stdout?: Writable;
}

/** Ejecuta un comando; rechaza con el final de stderr si termina con error. */
export const run = (command: string, args: string[], options: RunOptions = {}): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...options.env }, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr = (stderr + String(chunk)).slice(-2000)));
    if (options.stdout) child.stdout.pipe(options.stdout);
    else child.stdout.resume();
    if (options.stdin) options.stdin.pipe(child.stdin);
    else child.stdin.end();
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} terminó con código ${code}\n${stderr.trim()}`))));
  });

export const commandExists = (command: string): Promise<boolean> =>
  run(process.platform === "win32" ? "where" : "which", [command]).then(
    () => true,
    () => false
  );

type PgTool = "pg_dump" | "pg_restore" | "psql";

/** Corre una herramienta de Postgres contra `target` (binario local o `docker exec`). */
export const runPg = async (tool: PgTool, args: string[], target: Target, container: string, io: Omit<RunOptions, "env"> = {}): Promise<void> => {
  if (await commandExists(tool)) {
    const connection = ["-h", target.host, "-p", target.port, "-U", target.user, "-d", target.database];
    return run(tool, [...connection, ...args], { ...io, env: { PGPASSWORD: target.password } });
  }
  if (await commandExists("docker")) {
    // Dentro del contenedor la conexión es local: no aplican host ni puerto publicado.
    const exec = ["exec", "-i", "-e", `PGPASSWORD=${target.password}`, container, tool, "-U", target.user, "-d", target.database];
    return run("docker", [...exec, ...args], io);
  }
  throw new Error(`No encontré \`${tool}\` ni \`docker\` para hablar con la base.`);
};
