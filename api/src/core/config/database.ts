import { PrismaClient } from "@prisma/client";

/** Cliente Prisma singleton del proceso. */
export const prismaClient = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
