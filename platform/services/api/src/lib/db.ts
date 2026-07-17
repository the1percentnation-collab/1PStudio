import { getPrisma, type PrismaClient } from "@onepct/db";

export const db: PrismaClient = getPrisma();
