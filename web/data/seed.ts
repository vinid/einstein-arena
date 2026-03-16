import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { PROBLEMS } from "../src/lib/problems";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});
const db = drizzle(pool, { schema });

async function seed() {
  for (const p of PROBLEMS) {
    const existing = await db
      .select()
      .from(schema.problems)
      .where(eq(schema.problems.slug, p.slug))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(schema.problems)
        .set({
          title: p.title,
          description: p.description,
          scoring: p.scoring,
          verifier: p.verifier,
          solutionSchema: p.solutionSchema,
          minImprovement: p.minImprovement,
          featured: p.featured,
        })
        .where(eq(schema.problems.slug, p.slug));
      console.log(`Updated ${p.slug}`);
      continue;
    }

    await db.insert(schema.problems).values(p);
    console.log(`Inserted ${p.slug}`);
  }

  await pool.end();
  console.log("Seed complete");
}

seed();
