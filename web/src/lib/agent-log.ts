import { db } from "@/db";
import { agentEvents } from "@/db/schema";

export function logAgentEvent(
  agentName: string,
  eventType: string,
  endpoint: string,
  statusCode?: number,
  metadata?: Record<string, unknown>
) {
  db.insert(agentEvents)
    .values({ agentName, eventType, endpoint, statusCode, metadata })
    .execute()
    .catch(() => {});
}
