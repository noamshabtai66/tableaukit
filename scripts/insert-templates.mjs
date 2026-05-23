#!/usr/bin/env node
// Read tmp/template-curated.json + the chart-type CONTENT library from
// seed-templates.mjs's logic, INSERT all rows via Supabase JS service-role
// client (skips MCP token budget for large batches).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Inline-load .env.local (no dotenv dep)
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const eq = l.indexOf("=");
      return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()];
    }),
);

const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CONTENT = {
  sankey: {
    senior_take: "A Sankey diagram shows how a quantity flows through sequential category levels — customer journey, budget allocation, energy production. It's visually impressive but commonly misused: people reach for it to *show off*, not because the flow shape is actually the story. Use Sankey when the **path matters as much as the totals**. If your audience just needs to compare quantities, a stacked bar is faster to read. Sankeys with more than 5 levels become noise.",
    use_cases: "- **Customer journey funnels** — lead → MQL → SQL → close\n- **Budget flow** — revenue → department → cost center → margin\n- **Marketing attribution** — channel → campaign → conversion\n- **Cohort progression** — sign-up → activated → retained → churned",
    anti_patterns: "- **Only 2 dimensions?** Use a stacked bar.\n- **Audience needs exact numbers** → use a table or rich tooltips.\n- **More than 5 levels** → visual noise, consolidate stages.\n- **Time series** → this is a flow chart, not a trend chart.",
  },
  "hex-map": {
    senior_take: "A hex tile map solves *one* specific problem: the 'Alaska effect' — large, sparsely populated regions dominate visual weight while small dense regions disappear. Hex tiles sacrifice geographic accuracy entirely, and that tradeoff usually wins for political/demographic data. For 'where are our customers physically?', a real map almost always wins. A hex tile map should look *obviously not* like a real map.",
    use_cases: "- **US elections / political data** — avoid the Alaska effect\n- **State-level KPIs** — sales, customers, users by state\n- **Mobile-friendly maps** — hex tiles render cleanly at small sizes\n- **European data with equal weight per country**",
    anti_patterns: "- **Geographic precision matters** → use a real map\n- **Sub-state data** (counties, ZIPs) → use a real map or choropleth\n- **Audience expects a 'real' map** → add an inset",
  },
  dumbbell: {
    senior_take: "A dumbbell is the prettiest before/after chart in Tableau, and that's both its strength and its trap. Use a dumbbell when **three things are true**: (a) exactly two points per category, (b) the *gap* is the insight, (c) you want both endpoints visible. Dumbbells whisper — they don't shout. They're for *direction of change per row*, not magnitude comparison across rows.",
    use_cases: "- **Before / after** — ratings, satisfaction\n- **This year vs last** — sales by region\n- **Actual vs target** — single-number target per category\n- **Forecast vs actual** — planned vs realized",
  },
  bullet: {
    senior_take: "Stephen Few designed bullets in 2005 to replace gauges and pies on dashboards. They're still underused. A great bullet is **boring on purpose**: bar = actual, vertical line = target, grayscale bands = qualitative ranges. Reader's eye lands on 'did we hit the target?' in 1 second. Where it goes wrong: 5 bands when 3 would do; rainbow colors; horizontal when the dashboard begs for vertical.",
    use_cases: "- **KPI dashboards** — actual vs target with qualitative zones\n- **Performance reviews** — score against role expectations\n- **OKR tracking** — progress vs quarterly goal\n- **SLA monitoring** — response time vs target",
  },
  sparkline: {
    senior_take: "Sparklines are word-sized trends — context for a KPI without taking a full chart's worth of space. Use them as part of a KPI table, not standalone. The trap is over-decoration: axes, gridlines, tooltips defeat the purpose. Keep them naked. Show 6-12 data points. If your audience needs precise values, your sparkline failed.",
    use_cases: "- **KPI dashboards** with multiple metrics needing mini-trends\n- **Status pages** for SLA / uptime / volume\n- **Watchlists** — stock prices, server load, DAUs",
  },
  waterfall: {
    senior_take: "A waterfall chart breaks down 'how did we get from A to B' into named contributions. Great for explaining variance to executives because each bar is a *story*. The trap is when contributions are too many (>8 bars). Order matters: chronologically or biggest-to-smallest.",
    use_cases: "- **Variance analysis** — actual vs budget by contributing line\n- **Period-over-period bridges**\n- **Funnel decomposition**",
  },
  slope: {
    senior_take: "A slope chart shows two points per category connected by a line — like a dumbbell without endpoint dots. The slope itself encodes both magnitude and direction. Highlight 2-3 lines that tell the story, gray out the rest. A slope chart with 50 equal-weight lines is just spaghetti.",
    use_cases: "- **Rank shifts** — top 10 movers between Q1 and Q2\n- **Year-over-year comparisons**\n- **A/B comparison** when categories are paired",
    anti_patterns: "- **>15 lines** → use a small multiple\n- **Want exact values** → use a paired bar or table\n- **More than 2 time points** → use a line chart",
  },
  treemap: {
    senior_take: "Treemaps encode hierarchy + magnitude into nested rectangles. Use them when you have a single hierarchy level and 30+ categories where the *relative sizes* are the story. The trap: multi-level treemaps where small categories disappear. Most treemaps in the wild should have been bar charts.",
    use_cases: "- **Portfolio composition** — revenue by product\n- **Many categories, single dimension**\n- **Hierarchical data** with 2-3 levels max",
  },
  heatmap: {
    senior_take: "A heatmap is two categorical dimensions × one quantitative measure as color in a grid. The best heatmaps have a clear visual pattern visible at a glance. The worst are uniform speckle. Sort matters enormously: sort by row/column total or cluster algorithmically.",
    use_cases: "- **Calendar heatmaps** — activity per day across months\n- **Correlation matrices**\n- **Cohort retention**",
  },
  marimekko: {
    senior_take: "A Marimekko (Mekko) chart is a stacked bar where the *bar width* also encodes a quantity. Useful for market analysis. The killer mistake is rendering it without that interpretation in mind. Always label or highlight the width dimension. Works for ~5-10 segments.",
    use_cases: "- **Market segmentation** — share × volume\n- **Product mix** — units sold × margin\n- **Portfolio analysis**",
  },
  chord: {
    senior_take: "Chord diagrams show flows between members of the same group. Visually beautiful and almost always overused. They work for ~8-12 entities max. A chord diagram is a *poster*, not a *report*.",
    use_cases: "- **Bidirectional flows** — trade, migration, transitions\n- **Small networks** with ~10 nodes\n- **Showcase / presentation** charts",
  },
  radial: {
    senior_take: "Radial bar charts wrap a linear chart into a circle. Humans read angles worse than lengths, so radial usually sacrifices clarity for novelty. Use them when the data is genuinely cyclic (24 hours, 12 months, compass bearings) — that's where the circular metaphor adds meaning.",
  },
  sunburst: {
    senior_take: "A sunburst is a radial treemap — hierarchical data laid out as concentric rings. They suffer the same problems as treemaps plus the radial problem. Use them when the hierarchy is shallow (2-3 levels), <50 leaf nodes, and the audience expects 'beautiful' over 'efficient'.",
  },
  bump: {
    senior_take: "A bump chart shows ranking changes over time. Great for sports standings, market share rankings. With too many entities, lines tangle — filter to top 10-15. Color: assign a stable color per entity throughout. Always sort Y so 1 is at top.",
    use_cases: "- **Sports standings over a season**\n- **Market share rankings** quarter-over-quarter\n- **Top-N performers** changing over time",
  },
  "box-plot": {
    senior_take: "A box plot encodes a distribution into 5 numbers: min, Q1, median, Q3, max + outliers. Great for comparing distributions across categories. Audiences who haven't seen box plots find them mystifying — always explain in the title. For very small N (under ~20), use a strip plot or beeswarm instead.",
  },
  funnel: {
    senior_take: "Funnel charts visualize a conversion sequence. The visual metaphor is intuitive but often misrepresents: the visual width doesn't always match the actual ratio. For honest analysis, a horizontal bar chart is usually clearer.",
  },
  gantt: {
    senior_take: "Gantt charts show duration: each row is a task or entity, each bar spans start → end. They scale to hundreds of rows with filters. The classic mistake is putting Gantt in a dashboard with no filtering. Add a date range filter and category facets, always.",
  },
  scatter: {
    senior_take: "A scatter plot is the workhorse of two-variable analysis: each point's X-Y position encodes two measures. Use it to find correlation, clusters, or outliers. The trap is overcrowding: at 1000+ points use density encoding instead. Color = third dim, size = fourth.",
  },
  bubble: {
    senior_take: "A bubble chart is scatter with size encoding a third variable. Humans compare area badly: 2× area looks 'a bit bigger', not 2×. Use bubbles when the size dimension is roughly logarithmic and you want order-of-magnitude differences. For precise comparison, use regular scatter.",
  },
  donut: {
    senior_take: "A donut chart is a pie with the middle cut out. Donuts inherit all the readability problems of pies: humans compare angles badly. The center label can carry useful info. Use them for single-glance communication, not detailed comparison.",
  },
  pie: {
    senior_take: "Pie charts are decoded by angle, and humans are bad at angles. A horizontal bar chart conveys the same data more accurately. Pies work for 2-3 dramatic proportions or for non-analytical audiences who intuit pies.",
  },
  map: {
    senior_take: "A choropleth or marker map encodes geography directly. Great for 'where is this happening' questions. The trap: country/state choropleths over-represent large empty areas (Alaska effect). If geographic accuracy isn't critical, use a hex tile map.",
  },
  bar: {
    senior_take: "Bar charts are the most underrated chart type. Boring, which is a feature: humans decode length better than any other visual property. Sort by value, not alphabetically. Start the axis at zero. When 'this looks too simple' is the only objection, you've made the right call.",
  },
  column: {
    senior_take: "Column charts are vertical bars — same principle. Convention: columns for time on X axis, horizontal bars for categories. Column charts compress poorly when label text is long; if your X labels need to rotate, switch to horizontal bars.",
  },
  line: {
    senior_take: "Line charts are for showing change over a continuous variable — usually time. They scale beautifully: 5-10 lines without losing legibility. Don't treat discrete categories as a line. Gap missing data, don't connect through. Small multiples beat overlay charts for many series.",
  },
  area: {
    senior_take: "An area chart is a line with the area below filled. Use stacked area for total + composition over time. Standalone area charts rarely add anything over a line. Switch to 100% stacked when composition matters more than absolute totals.",
  },
  "stacked-bar": {
    senior_take: "A stacked bar shows part-to-whole composition for each category. Total height = total quantity, segments = composition. When categories have very different totals, smaller bars become hard to read for composition — switch to 100% stacked.",
  },
  histogram: {
    senior_take: "A histogram shows the distribution of a single continuous variable by binning. Critical choices: bin count (~10-30 is usually right) and bin alignment. Histograms reveal skew, multimodality, and outliers that summary stats hide.",
  },
  density: {
    senior_take: "A density plot is a smoothed histogram (KDE). Elegant but dangerous: smoothing changes the shape. For analytical work prefer a histogram. Compare distributions by overlaying 2-4 density curves max.",
  },
  kpi: {
    senior_take: "A KPI card (BAN — Big-Ass Number) is the simplest viz. Past 8-10 KPIs per screen, attention scatters. Pair each KPI with a sparkline or comparison ('vs target', 'vs last month'). Headline number should be 3-5× the label size.",
  },
  calendar: {
    senior_take: "Calendar heatmaps show daily values in a calendar grid. Brilliant for seasonality and day-of-week patterns. Use a sequential color scale with a clear floor (zero = blank). Always include year/month labels.",
  },
};

const TIER_BUILD_TIME = { 1: 30, 2: 20, 3: 15 };

function buildRow(t) {
  const content = CONTENT[t.chart_type] ?? null;
  const tier = t.content_tier;
  let senior_take = null, use_cases = null, anti_patterns = null;
  if (content) {
    senior_take = content.senior_take;
    if (tier <= 2) {
      use_cases = content.use_cases ?? null;
      anti_patterns = content.anti_patterns ?? null;
    }
  }
  return {
    slug: t.slug,
    name: t.name,
    subtitle: t.name,
    chart_type: t.chart_type,
    difficulty: t.difficulty,
    build_time_min: TIER_BUILD_TIME[tier] ?? 20,
    tableau_public_url: t.tableau_public_url,
    twbx_storage_path: null,
    preview_image_url: t.thumbnail_url,
    annotation_md: tier === 1 ? `## Source\n\nEmbedded from Tableau Public. Open the workbook from the link to inspect XML. Key calculations for **${t.chart_type}** are documented in the senior-take above.` : "",
    tags: [t.chart_type],
    author_name: t.author_name,
    author_profile_url: t.author_profile_url,
    license_note: "Embedded from Tableau Public. All rights to the original author. Commentary by TableauKit.",
    use_cases_md: use_cases,
    anti_patterns_md: anti_patterns,
    senior_take_md: senior_take,
    pitfalls_md: null,
    content_tier: tier,
    is_published: true,
  };
}

async function main() {
  const templates = JSON.parse(readFileSync("tmp/template-curated.json", "utf8"));
  console.log(`Inserting ${templates.length} templates via Supabase JS...`);
  const rows = templates.map(buildRow);

  // Upsert in chunks of 25
  const CHUNK = 25;
  let inserted = 0, skipped = 0, errors = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("tk_templates")
      .upsert(chunk, { onConflict: "slug", ignoreDuplicates: true })
      .select("slug");
    if (error) {
      console.error(`  chunk ${Math.floor(i / CHUNK) + 1}: ERROR`, error.message);
      errors++;
    } else {
      const n = data?.length ?? 0;
      inserted += n;
      skipped += chunk.length - n;
      console.log(`  chunk ${Math.floor(i / CHUNK) + 1}: ${n} inserted, ${chunk.length - n} skipped (already in DB)`);
    }
  }

  console.log(`\nTotal: ${inserted} inserted, ${skipped} skipped, ${errors} errors`);

  // Final count
  const { count } = await supabase.from("tk_templates").select("slug", { count: "exact", head: true });
  console.log(`DB now has ${count} templates total.`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
