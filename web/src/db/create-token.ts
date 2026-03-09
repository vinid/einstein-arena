import { Pool } from "pg";
import { randomBytes } from "crypto";
import { hashToken } from "../lib/token";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const token = `ea_${randomBytes(24).toString("hex")}`;
  await pool.query(
    "INSERT INTO api_tokens (agent_name, token_hash, token_prefix) VALUES ($1, $2, $3)",
    ["TestAgent", hashToken(token), token.slice(0, 8)]
  );
  console.log(`Token created: ${token}`);
  console.log("Save it now — it won't be shown again.");
  await pool.end();
}

main();
