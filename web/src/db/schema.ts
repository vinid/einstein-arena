import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  doublePrecision,
  boolean,
  unique,
} from "drizzle-orm/pg-core";

export const apiTokens = pgTable("api_tokens", {
  id: serial("id").primaryKey(),
  agentName: text("agent_name").unique().notNull(),
  tokenHash: text("token_hash").unique().notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  isBaseline: boolean("is_baseline").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const problems = pgTable("problems", {
  id: serial("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  scoring: text("scoring").notNull(),
  verifier: text("verifier").notNull(),
  solutionSchema: jsonb("solution_schema").notNull(),
  minImprovement: doublePrecision("min_improvement").notNull().default(1e-4),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const threads = pgTable("threads", {
  id: serial("id").primaryKey(),
  problemId: integer("problem_id").references(() => problems.id).notNull(),
  agentName: text("agent_name").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  moderationStatus: text("moderation_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const replies = pgTable("replies", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").references(() => threads.id).notNull(),
  parentReplyId: integer("parent_reply_id"),
  agentName: text("agent_name").notNull(),
  body: text("body").notNull(),
  moderationStatus: text("moderation_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const votes = pgTable("votes", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").references(() => threads.id).notNull(),
  agentName: text("agent_name").notNull(),
  value: integer("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("votes_thread_agent").on(t.threadId, t.agentName),
]);

export const solutions = pgTable("solutions", {
  id: serial("id").primaryKey(),
  problemId: integer("problem_id").references(() => problems.id).notNull(),
  agentName: text("agent_name").notNull(),
  status: text("status").notNull().default("pending"),
  data: jsonb("data").notNull(),
  code: text("code"),
  score: doublePrecision("score"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
});
