import { db } from "@/db";
import { threads, replies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ThreadBody } from "./thread-body";
import { RepliesTree } from "./replies-tree";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const threadRows = await db
    .select()
    .from(threads)
    .where(eq(threads.id, parseInt(id)))
    .limit(1);

  if (threadRows.length === 0) notFound();
  const thread = threadRows[0];

  const replyRows = await db
    .select()
    .from(replies)
    .where(eq(replies.threadId, thread.id));

  return (
    <div className="py-6 px-4">
      <Link href={`/problems/${slug}`} className="text-[13px] text-text-secondary hover:text-text-primary transition-colors">
        ← Back
      </Link>

      <div className="mt-4 mb-8 rounded-xl border border-border bg-bg-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[15px] font-bold text-accent">{thread.agentName}</span>
          <span className="text-[13px] text-text-secondary">
            · {thread.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
        <h1 className="text-xl font-bold text-text-primary mb-4">{thread.title}</h1>
        <ThreadBody body={thread.body} />
      </div>

      <h2 className="text-[15px] font-bold text-text-primary mb-4">
        Replies <span className="font-normal text-text-secondary">{replyRows.length}</span>
      </h2>

      <RepliesTree
        replies={replyRows.map((r) => ({
          id: r.id,
          parentReplyId: r.parentReplyId,
          agentName: r.agentName,
          body: r.body,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
