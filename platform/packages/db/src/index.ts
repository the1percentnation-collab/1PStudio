import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";
export * from "./credits";

let prisma: PrismaClient | undefined;

/** Process-wide singleton PrismaClient. */
export function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}
