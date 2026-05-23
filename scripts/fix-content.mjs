#!/usr/bin/env node
// Expand content per chart_type to cover use_cases + anti_patterns for ALL types,
// plus a generic fallback for 'other'. UPDATE only fields that are currently null.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const eq = l.indexOf("="); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]; }),
);
const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// Expanded library — every chart_type gets use_cases + anti_patterns.
const EXTRA = {
  chord: {
    use_cases: "- **Bidirectional flows** — trade between countries, transitions between states\n- **Small networks** with ~10 nodes\n- **Showcase / presentation** — when audience will spend 30+ seconds",
    anti_patterns: "- **>15 entities** → ribbons overlap into noise\n- **One-direction flow** → use a Sankey instead\n- **Audience needs numbers** → use a matrix table",
  },
  sunburst: {
    use_cases: "- **Hierarchical proportions** at 2-3 levels deep\n- **Visual showcase** when 'beautiful' matters more than 'efficient'\n- **<50 leaf nodes** with clear root → branch story",
    anti_patterns: "- **Many small leaves** → become invisible slivers\n- **Need to compare specific nodes** → use indented bar chart\n- **Single-level data** → use a donut or bar",
  },
  radial: {
    use_cases: "- **Cyclic time data** — hours of the day, days of the week, months\n- **Compass / directional data** — wind direction, GPS bearings\n- **Branded visual** where the circle is the design motif",
    anti_patterns: "- **Non-cyclic categorical data** → linear bar is more readable\n- **Audience needs precise comparison** → angles read worse than lengths\n- **>20 segments** → too crowded",
  },
  bump: {
    use_cases: "- **Sports standings over a season**\n- **Market share rankings** quarter-over-quarter\n- **Top-N performers** changing over time",
    anti_patterns: "- **Too many entities** (>15) → spaghetti\n- **Audience needs exact values** → use a table\n- **Single time point** → just use a bar with rank labels",
  },
  "box-plot": {
    use_cases: "- **Compare distributions** across categories (scores by school, response times by server)\n- **Show spread and outliers** in one chart\n- **Statistical analysis** for analyst audiences",
    anti_patterns: "- **Small N (<20 per group)** → use strip plot or beeswarm\n- **Non-analyst audience** → explain or use simpler chart\n- **Single distribution** → use a histogram instead",
  },
  funnel: {
    use_cases: "- **Conversion sequences** — visitors → leads → opportunities → close\n- **Pipeline stages** — application → interview → offer → hire\n- **Audience expects the metaphor** — non-technical stakeholders",
    anti_patterns: "- **Honest analytical work** → use a horizontal bar (more accurate widths)\n- **Stages aren't sequential** → use a regular bar\n- **More than ~6 stages** → small stages become invisible",
  },
  gantt: {
    use_cases: "- **Project plans** — tasks with start + end dates\n- **Event duration** — server uptime, employee tenure, contract terms\n- **Resource utilization** across time",
    anti_patterns: "- **Single point in time** → use a bar\n- **No filtering on a dashboard with >50 rows** → user scrolls forever\n- **Tasks without start/end** → use a checklist",
  },
  scatter: {
    use_cases: "- **Correlation analysis** between two measures\n- **Cluster detection** — find groups in 2D space\n- **Outlier hunting** — points far from the cluster",
    anti_patterns: "- **1000+ overlapping points** → use density encoding (alpha, 2D histogram)\n- **One variable categorical** → use a strip plot or grouped bar\n- **Audience needs precise XY values** → add a hover-detail table",
  },
  bubble: {
    use_cases: "- **3 dimensions** when the size variable is order-of-magnitude (population, GDP)\n- **Quadrant analysis** (BCG matrix style)\n- **Trade-off visualization** — risk vs reward with volume",
    anti_patterns: "- **Need precise comparison** → use scatter with color/small multiples for the 3rd dim\n- **Size variable not logarithmic** → bubbles mislead via area math\n- **Many small bubbles overlap** → use jitter or zoom",
  },
  donut: {
    use_cases: "- **Single-glance proportion** with a center number ('75% of target hit')\n- **2-3 dramatic proportions**\n- **KPI cards** where the donut visualizes one metric",
    anti_patterns: "- **More than 5 slices** → switch to horizontal bar\n- **Precise comparison needed** → angles are unreliable\n- **Multiple donuts in a grid** → tiny slices in each become unreadable",
  },
  pie: {
    use_cases: "- **2-3 dramatic proportions** (40/30/30)\n- **Non-analytical audience** that intuits pies\n- **Showing 'majority vs minority'** simply",
    anti_patterns: "- **5+ slices** → use horizontal bar\n- **Precise comparison** → bar always wins\n- **Composition over time** → use stacked area or grouped bar",
  },
  map: {
    use_cases: "- **Geographic distribution** of customers/sales/events\n- **Regional comparisons** when geography is the story\n- **Spatial clustering** detection",
    anti_patterns: "- **Equal weight per region matters** → use a hex tile map\n- **Subregional density** lost in big states → use bubble overlay\n- **Time-series of locations** → animate or use small multiples",
  },
  bar: {
    use_cases: "- **Compare quantities across categories** — the default 'show me X by Y'\n- **Ranked lists** sorted by value\n- **Period comparisons** (this year vs last per region)",
    anti_patterns: "- **Continuous time series** → use a line\n- **Part-to-whole when totals vary** → use 100% stacked\n- **20+ unsorted categories** → sort first, or filter top N",
  },
  column: {
    use_cases: "- **Time on X axis** — months, quarters, years\n- **Few categories with short labels**\n- **Side-by-side category × time** (grouped column)",
    anti_patterns: "- **Long category labels** → flip to horizontal bar\n- **Many categories (>15)** → vertical column gets crowded\n- **Continuous metric** → use line",
  },
  line: {
    use_cases: "- **Trend over time** — single or multiple series\n- **Forecast vs actual** with confidence bands\n- **Comparing 5-10 series** with smart color/labels",
    anti_patterns: "- **Discrete categorical X axis** (product names) → use bars\n- **Many overlapping lines (>10)** → use small multiples\n- **Connecting through missing data** → gap the line instead",
  },
  area: {
    use_cases: "- **Stacked area** for composition + total over time\n- **Magnitude emphasis** when fill adds meaning\n- **100% stacked area** for composition share",
    anti_patterns: "- **Single series** → use a line, fill adds no info\n- **One series dominates** → smaller series become invisible squiggles\n- **Need precise values** → use a line + table",
  },
  "stacked-bar": {
    use_cases: "- **Part-to-whole composition** per category\n- **Time × composition** (months × product mix)\n- **Survey results** (Likert scale across questions)",
    anti_patterns: "- **Categories with very different totals** → smaller bars become hard to read composition; use 100% stacked\n- **More than 5 segments per bar** → segments lose distinction\n- **Need to compare a single segment across bars** → use grouped bar",
  },
  density: {
    use_cases: "- **Compare 2-4 distribution shapes** elegantly\n- **Continuous data without bin choice anxiety**\n- **Presentation** when the curve reads as 'distribution'",
    anti_patterns: "- **Analytical work** → use a histogram (you see the actual bins)\n- **Many distributions overlaid (>4)** → use small multiples\n- **Discrete data** → histogram or bar",
  },
  histogram: {
    use_cases: "- **Distribution shape** of a single continuous variable\n- **Outlier detection** in a sample\n- **Skew / multimodality** — patterns hidden in summary stats",
    anti_patterns: "- **Categorical data** → use a bar chart\n- **Comparison across groups** → use density overlay or small multiples\n- **Tiny N (<30)** → use a strip plot or beeswarm",
  },
  kpi: {
    use_cases: "- **Executive dashboards** — scan-not-read\n- **Status pages** for monitoring single metrics\n- **Header strip** of a dashboard summarizing top 3-5 numbers",
    anti_patterns: "- **>8-10 KPIs on one screen** → attention scatters, group them\n- **KPI without comparison** → add 'vs target' or sparkline\n- **Tiny number with big label** → invert the size ratio",
  },
  calendar: {
    use_cases: "- **Activity per day** over months/years (contribution charts)\n- **Seasonality detection**\n- **Day-of-week patterns** in usage data",
    anti_patterns: "- **Low-intensity uniform data** → no pattern, just use a line\n- **Sub-daily granularity** → use a regular heatmap with hours\n- **No date axis labels** → unreadable",
  },
  treemap: {
    use_cases: "- **Portfolio composition** — 30+ categories, sizes matter\n- **Hierarchical data** at 1-2 levels\n- **Show relative proportion** when bar chart would be too tall",
    anti_patterns: "- **<20 categories** → bar chart is easier to compare\n- **Need precise comparison** → human area perception is bad\n- **Multi-level hierarchy (3+)** → tiny rectangles disappear",
  },
  heatmap: {
    use_cases: "- **Calendar heatmaps** — activity per day across months\n- **Correlation matrices** — N×N variables\n- **Cohort retention** — week × weeks since signup",
    anti_patterns: "- **<20 cells** → just use a bar chart\n- **One categorical dim** → not a heatmap, use bar\n- **Alphabetical sort hides patterns** → sort by total or cluster",
  },
  sparkline: {
    use_cases: "- **KPI tables** with mini-trends per row\n- **Status pages** showing recent trajectory\n- **Watchlists** — many entities, brief trend each",
    anti_patterns: "- **Need precise values** → use a full line chart\n- **Single big metric** → use a regular chart, sparklines are for multiplicity\n- **>20 sparklines** → too dense, filter first",
  },
  waterfall: {
    use_cases: "- **Variance analysis** — actual vs budget by line\n- **Period-over-period bridges** (Q1 → Q2 with named changes)\n- **Funnel decomposition** — starting cohort minus each drop-off",
    anti_patterns: "- **Many small contributions (>8)** → group into 'Other'\n- **Continuous time series** → use a line\n- **Unrelated bars that don't sum** → use a regular bar",
  },
  slope: {
    use_cases: "- **Rank shifts** — top 10 movers between two snapshots\n- **Year-over-year comparisons** for a manageable set\n- **A/B comparison** when categories are paired",
    anti_patterns: "- **>15 lines** → spaghetti, use small multiples\n- **Want exact values** → use paired bar or table\n- **More than 2 time points** → use a line chart",
  },
  marimekko: {
    use_cases: "- **Market segmentation** — share × volume in one chart\n- **Product mix** — units sold × margin per product\n- **Portfolio analysis** with two quantities per category",
    anti_patterns: "- **Width dimension isn't critical** → just use a stacked bar\n- **>10 segments** → unreadable, group small ones\n- **Audience unfamiliar with format** → educate or pick different chart",
  },
  dumbbell: {
    use_cases: "- **Before/after** — ratings, satisfaction, performance\n- **This year vs last** — sales by region\n- **Actual vs target** — single-value target per category",
    anti_patterns: "- **>2 points per category** → use grouped bar\n- **Single value per category** → use bar\n- **Continuous time series** → use a line",
  },
  bullet: {
    use_cases: "- **KPI dashboards** — actual vs target with qualitative zones\n- **Performance reviews** — score vs role expectations\n- **OKR tracking** — progress vs quarterly goal",
    anti_patterns: "- **No clear target** → use a bar chart\n- **>10 KPIs** → use a small-multiple grid\n- **Audience unfamiliar** → educate or use labeled bar",
  },
  sankey: {
    use_cases: "- **Customer journey funnels** — lead → MQL → SQL → close\n- **Budget flow** — revenue → cost centers → margin\n- **Marketing attribution** — channel → campaign → conversion",
    anti_patterns: "- **Only 2 dimensions** → stacked bar\n- **Audience needs exact numbers** → table or rich tooltips\n- **>5 levels** → consolidate stages first",
  },
  "hex-map": {
    use_cases: "- **US elections / political data** — avoid the Alaska effect\n- **State-level KPIs** — sales, customers, users\n- **Mobile-friendly maps** — hex tiles render cleanly at small sizes",
    anti_patterns: "- **Geographic precision matters** → use a real map\n- **Sub-state data** (counties, ZIPs) → use a real map or choropleth\n- **Audience expects 'real' map** → add an inset",
  },
};

// Generic content for 'other' chart_type templates (mostly creative VOTD-style vis,
// dashboards, or experimental work).
const OTHER_FALLBACK = {
  senior_take: "This template doesn't fit a single chart-type bucket — it's a multi-element dashboard or experimental visualization. Use it for inspiration on layout, color, narrative structure, or interactive design rather than as a copy-paste chart template. The most valuable thing to do with this kind of viz is **open the workbook, look at the worksheet list, and understand how the dashboard composes individual charts** — then apply that composition logic to your own work, not the exact data.",
  use_cases: "- **Layout inspiration** for dashboards with multiple chart types\n- **Storytelling structure** — how to sequence information for a reader\n- **Interactive design patterns** — set actions, parameters, drill-throughs\n- **Color and typography** decisions you can adapt to your brand",
  anti_patterns: "- **Treating it as a chart template** — most of these dashboards combine 4-8 worksheets; you can't copy one chart and reuse it without context\n- **Copying the data structure** — the data behind these is often custom-shaped; your data won't fit\n- **Skipping the original author's blog post** — most of these have explanatory writeups that the viz alone can't communicate",
};

async function main() {
  const { data: templates } = await supabase
    .from("tk_templates")
    .select("slug, chart_type, content_tier, senior_take_md, use_cases_md, anti_patterns_md")
    .eq("is_published", true);

  console.log(`Loaded ${templates.length} templates. Computing updates...`);
  let updates = 0;
  for (const t of templates) {
    const patch = {};
    const isOther = t.chart_type === "other";
    const extra = EXTRA[t.chart_type];

    // Fill use_cases / anti_patterns for T1/T2 if missing
    if (t.content_tier <= 2) {
      if (!t.use_cases_md) {
        if (extra?.use_cases) patch.use_cases_md = extra.use_cases;
        else if (isOther) patch.use_cases_md = OTHER_FALLBACK.use_cases;
      }
      if (!t.anti_patterns_md) {
        if (extra?.anti_patterns) patch.anti_patterns_md = extra.anti_patterns;
        else if (isOther) patch.anti_patterns_md = OTHER_FALLBACK.anti_patterns;
      }
    }
    // Fill senior_take if missing (covers 'other' + any holes)
    if (!t.senior_take_md && isOther) patch.senior_take_md = OTHER_FALLBACK.senior_take;

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("tk_templates").update(patch).eq("slug", t.slug);
      if (error) console.error(`  ${t.slug}: ${error.message}`);
      else updates++;
    }
  }
  console.log(`Patched ${updates} templates.`);
}

main().catch((err) => { console.error("fatal:", err); process.exit(1); });
