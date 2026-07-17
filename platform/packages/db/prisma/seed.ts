import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Dev seed: one user, one PRO workspace, credits, a known API key, a brand template. */
async function main() {
  const user = await db.user.upsert({
    where: { email: "the1percentnation@gmail.com" },
    update: {},
    create: { email: "the1percentnation@gmail.com", name: "Anthony Brown" },
  });

  let workspace = await db.workspace.findFirst({ where: { name: "The One Percent Nation" } });
  if (!workspace) {
    workspace = await db.workspace.create({
      data: {
        name: "The One Percent Nation",
        planId: "PRO",
        memberships: { create: { userId: user.id, role: "OWNER" } },
        subscription: { create: { planId: "PRO", status: "STUB" } },
      },
    });
  }

  const rawKey = "dev_sk_local";
  const hashedKey = createHash("sha256").update(rawKey).digest("hex");
  await db.apiKey.upsert({
    where: { hashedKey },
    update: { revokedAt: null },
    create: { workspaceId: workspace.id, userId: user.id, hashedKey, prefix: "dev_sk" },
  });

  await db.creditLedger.upsert({
    where: { idempotencyKey: `seed-grant-${workspace.id}` },
    update: {},
    create: {
      workspaceId: workspace.id,
      delta: 1200,
      reason: "GRANT",
      idempotencyKey: `seed-grant-${workspace.id}`,
    },
  });

  const existingTemplate = await db.brandTemplate.findFirst({ where: { workspaceId: workspace.id } });
  if (!existingTemplate) {
    await db.brandTemplate.create({
      data: {
        workspaceId: workspace.id,
        name: "1P Default",
        isDefault: true,
        captionStyle: {
          fontFamily: "DejaVu Sans",
          fontSizePx: 64,
          primaryColor: "#ffffff",
          highlightColor: "#ffd54a",
          outlineColor: "#000000",
          outlinePx: 4,
          marginVPct: 18,
          allCaps: true,
          karaoke: true,
        },
        colors: { primary: "#0f0f0f", accent: "#ffd54a" },
      },
    });
  }

  const balance = await db.creditLedger.aggregate({ where: { workspaceId: workspace.id }, _sum: { delta: true } });
  console.log(`Seeded workspace ${workspace.id} (${workspace.name})`);
  console.log(`API key: ${rawKey}`);
  console.log(`Credit balance: ${balance._sum.delta}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
