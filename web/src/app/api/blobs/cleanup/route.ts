import { NextRequest, NextResponse } from "next/server";
import { list, del } from "@vercel/blob";

const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ skipped: true, reason: "blob_not_configured" });
  }

  const cutoff = new Date(Date.now() - ORPHAN_AGE_MS);
  let cursor: string | undefined;
  let deleted = 0;
  let scanned = 0;

  do {
    const { blobs, cursor: next } = await list({ prefix: "solutions/", limit: 100, cursor });
    cursor = next;

    const stale = blobs.filter(b => new Date(b.uploadedAt) < cutoff);
    scanned += blobs.length;

    if (stale.length > 0) {
      await del(stale.map(b => b.url));
      deleted += stale.length;
      console.log(`[blob-cleanup] deleted ${stale.length} orphaned blobs`);
    }
  } while (cursor);

  console.log(`[blob-cleanup] done: scanned=${scanned} deleted=${deleted}`);
  return NextResponse.json({ scanned, deleted });
}
