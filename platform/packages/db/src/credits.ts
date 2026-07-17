import type { LedgerReason, PrismaClient } from "@prisma/client";

/**
 * Append-only ledger helpers. This module is the ONLY write path to
 * CreditLedger — there is deliberately no update/delete helper.
 * `idempotencyKey` makes retried pipeline activities charge exactly once.
 */
export async function appendLedgerEntry(
  db: PrismaClient,
  entry: {
    workspaceId: string;
    delta: number;
    reason: LedgerReason;
    stage?: string;
    jobId?: string;
    idempotencyKey: string;
  }
): Promise<{ applied: boolean }> {
  try {
    await db.creditLedger.create({ data: entry });
    return { applied: true };
  } catch (err: unknown) {
    // P2002 = unique violation on idempotencyKey → already charged, that's fine.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return { applied: false };
    }
    throw err;
  }
}

export async function creditBalance(db: PrismaClient, workspaceId: string): Promise<number> {
  const agg = await db.creditLedger.aggregate({ where: { workspaceId }, _sum: { delta: true } });
  return agg._sum.delta ?? 0;
}
