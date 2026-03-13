import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL! });

async function main() {
  await client.connect();

  const plans = [
    {
      name: "Free",
      slug: "free",
      priceCentsMonthly: 0,
      briefingsPerWeek: 3,
      maxDurationMinutes: 5,
      maxPodcastSubscriptions: 3,
      isDefault: true,
      highlighted: false,
      priorityProcessing: false,
      earlyAccess: false,
      researchMode: false,
      crossPodcastSynthesis: false,
      adFree: false,
      features: [
        "3 briefings per week",
        "Up to 5 min briefings",
        "3 podcast subscriptions",
      ],
      sortOrder: 0,
    },
    {
      name: "Pro",
      slug: "pro",
      priceCentsMonthly: 999,
      briefingsPerWeek: null,
      maxDurationMinutes: 15,
      maxPodcastSubscriptions: null,
      isDefault: false,
      highlighted: true,
      priorityProcessing: true,
      earlyAccess: false,
      researchMode: false,
      crossPodcastSynthesis: false,
      adFree: false,
      features: [
        "Unlimited briefings",
        "Up to 15 min briefings",
        "Unlimited podcast subscriptions",
        "Priority processing",
      ],
      sortOrder: 1,
    },
    {
      name: "Pro+",
      slug: "pro-plus",
      priceCentsMonthly: 1999,
      priceCentsAnnual: 19990,
      briefingsPerWeek: null,
      maxDurationMinutes: 30,
      maxPodcastSubscriptions: null,
      isDefault: false,
      highlighted: false,
      priorityProcessing: true,
      earlyAccess: true,
      researchMode: false,
      crossPodcastSynthesis: false,
      adFree: false,
      features: [
        "Unlimited briefings",
        "Up to 30 min briefings",
        "Unlimited podcast subscriptions",
        "Priority processing",
        "Early access to new features",
      ],
      sortOrder: 2,
    },
  ];

  for (const plan of plans) {
    await client.query(
      `INSERT INTO "Plan" (
        id, name, slug, "priceCentsMonthly", "priceCentsAnnual",
        "briefingsPerWeek", "maxDurationMinutes", "maxPodcastSubscriptions",
        "isDefault", highlighted, "priorityProcessing", "earlyAccess",
        "researchMode", "crossPodcastSynthesis", "adFree",
        features, "sortOrder", active, "trialDays",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text, $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14,
        $15, $16, true, 0,
        NOW(), NOW()
      )
      ON CONFLICT (slug) DO NOTHING`,
      [
        plan.name,
        plan.slug,
        plan.priceCentsMonthly,
        (plan as any).priceCentsAnnual ?? null,
        plan.briefingsPerWeek,
        plan.maxDurationMinutes,
        plan.maxPodcastSubscriptions,
        plan.isDefault,
        plan.highlighted,
        plan.priorityProcessing,
        plan.earlyAccess,
        plan.researchMode,
        plan.crossPodcastSynthesis,
        plan.adFree,
        plan.features,
        plan.sortOrder,
      ]
    );
    console.log(`Upserted plan: ${plan.name}`);
  }

  // Backfill: assign existing users without a plan to the free plan
  const freePlanResult = await client.query(
    `SELECT id FROM "Plan" WHERE slug = 'free' LIMIT 1`
  );
  if (freePlanResult.rows.length > 0) {
    const freePlanId = freePlanResult.rows[0].id;
    const backfill = await client.query(
      `UPDATE "User" SET "planId" = $1 WHERE "planId" IS NULL`,
      [freePlanId]
    );
    if (backfill.rowCount && backfill.rowCount > 0) {
      console.log(`Backfilled ${backfill.rowCount} user(s) to free plan.`);
    }
  }

  console.log("Seeded plans.");
}

main()
  .then(() => client.end())
  .catch(async (e) => {
    console.error(e);
    await client.end();
    process.exit(1);
  });
