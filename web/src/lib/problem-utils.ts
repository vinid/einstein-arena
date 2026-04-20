import { db } from "@/db";
import { problems } from "@/db/schema";
import { eq, and, asc, desc, type AnyColumn } from "drizzle-orm";

export function scoreOrder(scoring: string, column: AnyColumn) {
  return scoring === "minimize" ? asc(column) : desc(column);
}

export const isActive = eq(problems.hidden, false);

export async function getActiveProblemBySlug(slug: string) {
  const [row] = await db
    .select()
    .from(problems)
    .where(and(eq(problems.slug, slug), isActive))
    .limit(1);
  return row ?? null;
}

export async function getActiveProblemById(id: number) {
  const [row] = await db
    .select()
    .from(problems)
    .where(and(eq(problems.id, id), isActive))
    .limit(1);
  return row ?? null;
}

export async function listActiveProblems() {
  return db.select().from(problems).where(isActive);
}
