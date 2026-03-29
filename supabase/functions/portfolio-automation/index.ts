import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Position = {
  user_id: string;
  ticker: string;
  name: string | null;
  avg_cost: number | null;
  last_price: number | null;
  portfolio_weight: number | null;
  max_weight_allowed: number | null;
  entry_reason_summary: string | null;
  exit_invalidators_summary: string | null;
};

type WatchItem = {
  user_id: string;
  ticker: string;
  added_at: string;
};

const WATCH_COOLDOWN_DAYS = 7;

const daysSince = (value: string) => Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
const pnl = (position: Position) =>
  !position.avg_cost || !position.last_price ? 0 : ((position.last_price - position.avg_cost) / position.avg_cost) * 100;

function buildSummary(userId: string, positions: Position[], watchlist: WatchItem[]) {
  const overweight = positions.filter((item) => {
    const weight = item.portfolio_weight || 0;
    const max = item.max_weight_allowed || 0.15;
    return weight > max;
  });
  const drawdowns = positions.filter((item) => pnl(item) <= -12);
  const watchReady = watchlist.filter((item) => daysSince(item.added_at) >= WATCH_COOLDOWN_DAYS);
  const thesisMissing = positions.filter((item) => !item.entry_reason_summary || !item.exit_invalidators_summary);
  const riskLevel = overweight.length + drawdowns.length >= 3 ? "high" : overweight.length + drawdowns.length > 0 ? "medium" : "low";

  return {
    userId,
    riskLevel,
    overweight,
    drawdowns,
    watchReady,
    thesisMissing,
    summary: {
      overweightCount: overweight.length,
      drawdownCount: drawdowns.length,
      watchReadyCount: watchReady.length,
      thesisMissingCount: thesisMissing.length,
    },
  };
}

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) {
    return new Response(JSON.stringify({ error: "Missing Supabase env." }), { status: 500 });
  }

  const supabase = createClient(url, serviceRole);
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: positions }, { data: watchlist }, { data: users }] = await Promise.all([
    supabase.from("positions").select("user_id,ticker,name,avg_cost,last_price,portfolio_weight,max_weight_allowed,entry_reason_summary,exit_invalidators_summary"),
    supabase.from("watchlist").select("user_id,ticker,added_at"),
    supabase.from("user_config").select("user_id"),
  ]);

  const userIds = new Set<string>([
    ...(users || []).map((row) => row.user_id),
    ...((positions || []) as Position[]).map((row) => row.user_id),
    ...((watchlist || []) as WatchItem[]).map((row) => row.user_id),
  ]);

  const results = [];

  for (const userId of userIds) {
    const existingRun = await supabase.from("automation_runs").select("id").eq("user_id", userId).eq("run_date", today).maybeSingle();
    if (existingRun.data?.id) {
      results.push({ userId, skipped: true });
      continue;
    }

    const summary = buildSummary(
      userId,
      ((positions || []) as Position[]).filter((item) => item.user_id === userId),
      ((watchlist || []) as WatchItem[]).filter((item) => item.user_id === userId),
    );

    await supabase.from("automation_runs").insert({
      user_id: userId,
      run_date: today,
      risk_level: summary.riskLevel,
      summary: summary.summary,
    });

    await supabase.from("events").insert([
      {
        user_id: userId,
        title: `Daily automation summary: ${summary.riskLevel}`,
        detail: `Overweight ${summary.summary.overweightCount}, drawdown ${summary.summary.drawdownCount}, watch ready ${summary.summary.watchReadyCount}, thesis missing ${summary.summary.thesisMissingCount}.`,
        severity: summary.riskLevel === "high" ? "danger" : summary.riskLevel === "medium" ? "warning" : "info",
      },
      ...summary.watchReady.slice(0, 5).map((item) => ({
        user_id: userId,
        title: `${item.ticker} watchlist ready`,
        detail: "Cooldown finished. Move it into formal trade review if the thesis still holds.",
        severity: "warning",
      })),
      ...summary.thesisMissing.slice(0, 5).map((item) => ({
        user_id: userId,
        title: `${item.ticker} needs review draft`,
        detail: "Position is missing thesis or invalidation. Fill them before the next trade.",
        severity: "warning",
      })),
    ]);

    results.push({ userId, skipped: false, summary: summary.summary });
  }

  return new Response(JSON.stringify({ ok: true, date: today, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
