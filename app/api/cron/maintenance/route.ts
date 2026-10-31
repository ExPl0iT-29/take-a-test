import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Hit this periodically (Vercel Cron, cron-job.org, n8n, UptimeRobot...)
 * with `Authorization: Bearer <CRON_SECRET>`. Closes attempts nobody ever
 * explicitly submitted — tab closed, connection lost, candidate just
 * walked away — so they don't sit `in_progress` forever ungraded.
 *
 * Add CRON_SECRET to .env.local (openssl rand -hex 32) and to your cron
 * scheduler's config. Not wired to a schedule here — Vercel Hobby plans
 * only support daily cron frequency, which is too coarse for a live exam
 * window, so an external scheduler hitting this every 1-5 minutes is the
 * recommended setup; see README.
 */
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await adminClient().rpc("close_expired_attempts");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, closed: data });
}
