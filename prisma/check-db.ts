import pg from "pg";
import "dotenv/config";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();

  const requests = await client.query(
    `SELECT id, status, "podcastIds", "episodeIds", "useLatest", "isTest", "createdAt" FROM "BriefingRequest" ORDER BY "createdAt" DESC LIMIT 5`
  );
  console.log(`=== Requests (${requests.rowCount}) ===`);
  for (const r of requests.rows) {
    console.log(`  ${r.id} | ${r.status} | pods=${JSON.stringify(r.podcastIds)} eps=${JSON.stringify(r.episodeIds)} latest=${r.useLatest} test=${r.isTest}`);
  }

  // Check episodes for request's podcasts
  if (requests.rows.length > 0) {
    const podIds = requests.rows[0].podcastIds || [];
    for (const pid of podIds) {
      const eps = await client.query(
        `SELECT id, title, "transcriptUrl" FROM "Episode" WHERE "podcastId" = $1 ORDER BY "publishedAt" DESC LIMIT 3`,
        [pid]
      );
      console.log(`\n=== Episodes for podcast ${pid} (${eps.rowCount}) ===`);
      for (const e of eps.rows) {
        console.log(`  ${e.id} | ${e.title} | transcript=${e.transcriptUrl ?? "null"}`);
      }
    }
  }

  const dists = await client.query(`SELECT id, "episodeId", status FROM "Distillation" LIMIT 5`);
  console.log(`\n=== Distillations (${dists.rowCount}) ===`);
  for (const d of dists.rows) {
    console.log(`  ${d.id} | ep=${d.episodeId} | ${d.status}`);
  }

  const jobs = await client.query(
    `SELECT id, type, status, stage, "entityId", "requestId", "createdAt" FROM "PipelineJob" ORDER BY "createdAt" DESC LIMIT 10`
  );
  console.log(`\n=== Pipeline Jobs (${jobs.rowCount}) ===`);
  for (const j of jobs.rows) {
    console.log(`  ${j.id} | stage=${j.stage} ${j.type} | ${j.status} | entity=${j.entityId} req=${j.requestId}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => client.end());
