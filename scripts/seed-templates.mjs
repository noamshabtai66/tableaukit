#!/usr/bin/env node
// Read tmp/template-curated.json, generate SQL INSERT batches with senior-analyst
// content per chart_type. Output: supabase/seeds/002_mass_templates.sql + batch files.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const IN = "tmp/template-curated.json";
const OUT = "supabase/seeds/002_mass_templates.sql";
const BATCH_DIR = "tmp/sql-batches";
const BATCH_SIZE = 20;

// =====================================================================
// CONTENT LIBRARY — per chart_type. Each row of tk_templates gets
// these fields populated based on its chart_type, plus its own
// metadata (title, author, URL, thumbnail).
//
// Tier 1 templates get full content + XML annotation override (manual).
// Tier 2 templates get senior_take + use_cases + anti_patterns.
// Tier 3 templates get senior_take only.
// Templates with chart_type='other' get no content (Tier 3, embed-only).
// =====================================================================

const CONTENT = {
  sankey: {
    senior_take: "A Sankey diagram shows how a quantity flows through sequential category levels — customer journey, budget allocation, energy production. It's visually impressive but commonly misused: people reach for it to *show off*, not because the flow shape is actually the story. Use Sankey when the **path matters as much as the totals** — e.g. funnel stages where you care about both conversion and which path users took. If your audience just needs to compare quantities, a stacked bar is faster to read. Sankeys with more than 5 levels become noise; consolidate stages first.",
    use_cases: "- **Customer journey funnels** — lead → MQL → SQL → close\n- **Budget flow** — revenue → department → cost center → margin\n- **Marketing attribution** — channel → campaign → conversion\n- **Cohort progression** — sign-up → activated → retained → churned",
    anti_patterns: "- **Only 2 dimensions?** Use a stacked bar — Sankey adds complexity without clarity.\n- **Audience needs exact numbers** → use a table or rich tooltips.\n- **More than 5 levels** → visual noise, consolidate stages.\n- **Time series** → this is a flow chart, not a trend chart. Use a line."
  },
  "hex-map": {
    senior_take: "A hex tile map solves *one* specific problem: the 'Alaska effect' — large, sparsely populated regions dominate visual weight while small dense regions disappear. NJ has more people than the entire Rocky Mountain region, but on a real map it's a sliver. Hex tiles sacrifice geographic accuracy entirely (proximity, shape, area), and that tradeoff usually wins for political/demographic data. For 'where are our customers physically?', a real map almost always wins. The unspoken rule: a hex tile map should look *obviously not* like a real map — don't try to make it 'almost geographic' or you get the worst of both worlds.",
    use_cases: "- **US elections / political data** — avoid the Alaska effect\n- **State-level KPIs** — sales, customers, users by state\n- **Mobile-friendly maps** — hex tiles render cleanly at small sizes\n- **European data with equal weight per country**",
    anti_patterns: "- **Geographic precision matters** → use a real map\n- **Sub-state data** (counties, ZIPs) → use a real map or choropleth\n- **Audience expects a 'real' map** → add an inset showing the abstract → geographic mapping"
  },
  dumbbell: {
    senior_take: "A dumbbell is the prettiest before/after chart in Tableau, and that's both its strength and its trap. People reach for it because it looks 'designerly' — then they use it for data where the gap isn't actually the story. Use a dumbbell when **three things are true**: (a) you have exactly two points per category, (b) the *gap* or direction of change is the insight, and (c) you want both endpoints visible (not just the change). If only (a) is true, use a bar chart with two colors. Dumbbells whisper, they don't shout — they're for *direction of change per row*, not magnitude comparison across rows.",
    use_cases: "- **Before / after** — ratings, satisfaction, performance\n- **This year vs last** — sales by region 2025 → 2026\n- **Actual vs target** — single-number target per category\n- **Forecast vs actual** — planned vs realized"
  },
  bullet: {
    senior_take: "Stephen Few designed bullet charts in 2005 to replace gauges and pies on dashboards. They're still underused — not because they're inferior, but because most analysts reach for 'what looks familiar' (gauges, donuts) instead of 'what communicates fastest'. A great bullet is **boring on purpose**: the bar is the actual value, the target is a single vertical line, the qualitative bands are subtle grayscale rectangles. The reader's eye lands on 'did we hit the target?' in 1 second. Where it goes wrong: 5 bands when 3 would do; rainbow colors that distract from the comparison; horizontal when the dashboard begs for vertical.",
    use_cases: "- **KPI dashboards** — actual vs target with qualitative zones\n- **Performance reviews** — score against role expectations\n- **OKR tracking** — progress vs quarterly goal\n- **SLA monitoring** — response time vs target"
  },
  sparkline: {
    senior_take: "Sparklines are word-sized trends — context for a KPI without taking a full chart's worth of space. They're a Tufte invention from 2006: the goal is to encode the *shape* of recent history next to the current value. Use them as part of a KPI table, not as standalone charts. The trap is over-decoration: axes, gridlines, tooltips on a sparkline defeat the purpose. Keep them naked. Show 6-12 data points (enough to read a trend, not so many it becomes noise). If your audience needs precise values, your sparkline failed — give them the full chart.",
    use_cases: "- **KPI dashboards** with multiple metrics, each needing a mini-trend\n- **Status pages** for SLA / uptime / volume\n- **Watchlists** — stock prices, server load, daily active users",
    anti_patterns: "- **Audience needs precise values** → use a full line chart\n- **Single big metric** → use a regular chart, sparklines are for *multiplicity*\n- **More than 20 sparklines** → too dense, group or filter first"
  },
  waterfall: {
    senior_take: "A waterfall chart breaks down 'how did we get from A to B' into named contributions. Classic use: starting revenue + new sales − churn − refunds = ending revenue. Great for explaining variance to executives because each bar is a *story*. The trap is when contributions are too many (>8 bars), or when the named buckets don't add up clearly. Order matters: tell the story chronologically or biggest-to-smallest. Color: positive = green-ish, negative = red-ish, totals = neutral gray. Show net totals at intermediate points to anchor the eye.",
    use_cases: "- **Variance analysis** — actual vs budget by contributing line\n- **Period-over-period bridges** — Q1 → Q2 with named changes\n- **Funnel decomposition** — starting cohort, minus each drop-off cause",
    anti_patterns: "- **Many small contributions** → group small ones into 'Other'\n- **Continuous time series** → use line; waterfall is for discrete causes\n- **Unrelated bars** that don't actually sum → just use a bar chart"
  },
  slope: {
    senior_take: "A slope chart shows two points per category connected by a line — like a dumbbell, but without the endpoint dots. It's the chart for 'show me what changed between these two moments.' The slope itself encodes both magnitude and direction at once: steep up vs gentle down reads instantly. Use a slope when you want to *de-emphasize* the values themselves and emphasize the change. The unspoken rule: highlight 2-3 lines that tell the story, gray out the rest. A slope chart with 50 equal-weight lines is just spaghetti.",
    use_cases: "- **Rank shifts** — top 10 movers between Q1 and Q2\n- **Year-over-year comparisons** for a manageable set of categories\n- **A/B comparison** when categories are paired",
    anti_patterns: "- **>15 lines** → use a small multiple, slope becomes spaghetti\n- **Want to see exact values** → use a paired bar or table\n- **More than 2 time points** → use a line chart"
  },
  treemap: {
    senior_take: "Treemaps encode hierarchy + magnitude into nested rectangles. They're great for showing 'what's the relative size of these things' when you have a single hierarchy level — like revenue by product category. The trap is multi-level treemaps where small categories disappear into thin slivers. Color is wasted on hierarchy; use it for a *second* dimension (profitability, growth rate) instead. Most treemaps in the wild should have been bar charts — bars are easier to compare. Reach for treemap when you genuinely have 30+ categories and the *relative sizes* are the story.",
    use_cases: "- **Portfolio composition** — revenue by product, spend by category\n- **Many categories, single dimension** — when bars would be too crowded\n- **Hierarchical data** with 2-3 levels max"
  },
  heatmap: {
    senior_take: "A heatmap is two categorical dimensions × one quantitative measure encoded as color in a grid. They scale to hundreds of cells, which is both the appeal and the danger. The best heatmaps have a clear visual pattern visible at a glance — clusters, diagonals, gaps. The worst are uniform speckle that requires hovering every cell. Sort matters enormously: sort by row or column total, or cluster algorithmically. A heatmap with alphabetical labels almost never reveals patterns. Color scale: diverging (red-blue) for relative comparisons around a center, sequential (light-to-dark) for absolute values.",
    use_cases: "- **Calendar heatmaps** — activity per day across months\n- **Correlation matrices** — N×N for correlation strength\n- **Cohort retention** — sign-up week × weeks since signup",
    anti_patterns: "- **<20 cells** → use a regular bar or grouped bar\n- **One categorical dim** → use a bar chart\n- **Alphabetical sort** → sort by total or cluster instead"
  },
  marimekko: {
    senior_take: "A Marimekko (or 'Mekko') chart is a stacked bar where the *bar width* also encodes a quantity — typically segment size. Result: each rectangle's area represents share × volume. Useful for market analysis: 'segment A is 40% of customers but only 10% of revenue.' The killer mistake is rendering it without that interpretation in mind — readers see a stacked bar and lose the width signal. Always label or highlight the width dimension explicitly. Marimekkos work for ~5-10 segments; beyond that, find a different chart.",
    use_cases: "- **Market segmentation** — share × volume\n- **Product mix** — units sold × margin per product\n- **Portfolio analysis** — count × value per category",
    anti_patterns: "- **Width dimension isn't critical** → just use a stacked bar\n- **More than 10 segments** → unreadable, group small ones\n- **Audience unfamiliar with the format** → educate or pick a different chart"
  },
  chord: {
    senior_take: "Chord diagrams show flows between members of the same group — e.g. trade between countries, migration between cities. They're visually beautiful and almost always overused. Most chord diagrams obscure their data: with 20+ groups, the ribbons overlap into noise. They work for ~8-12 entities max, where each ribbon tells a clear story. The unspoken rule: a chord diagram is a *poster*, not a *report*. Use it when the audience will spend 30 seconds appreciating it, not when they need to extract numbers fast.",
    use_cases: "- **Bidirectional flows** — trade, migration, transitions between states\n- **Small networks** with ~10 nodes\n- **Showcase / presentation** charts, not dashboards"
  },
  radial: {
    senior_take: "Radial bar charts (and their cousins — sunburst, polar) wrap a linear chart into a circle. The pitch is that they save space and look fancy. The reality is that *people read angles worse than lengths*, so radial almost always sacrifices clarity for novelty. Use them when the data is genuinely cyclic (24 hours, 12 months, compass bearings) — that's the case where the circular metaphor adds meaning. For everything else, the linear equivalent is faster to read. If you can't justify the circle, don't draw one.",
    use_cases: "- **Cyclic time data** — hours of the day, months of the year\n- **Compass / directional data** — wind direction, GPS bearings\n- **Branded marketing visuals** where aesthetic > legibility"
  },
  sunburst: {
    senior_take: "A sunburst is a radial treemap — hierarchical data laid out as concentric rings. The center is the root, outer rings are deeper levels. They look impressive in presentations. Practically: they suffer the same problems as treemaps (small slices disappear) plus the radial problem (angles are harder to compare than lengths). Use them when (a) the hierarchy is shallow (2-3 levels), (b) you have <50 leaf nodes, and (c) the audience expects 'beautiful' over 'efficient'. For real analysis, a horizontal bar chart with indentation wins."
  },
  bump: {
    senior_take: "A bump chart shows ranking changes over time — each entity is a line, the Y axis is rank (1 = top). Crossings = rank swaps. Great for sports standings, market share rankings, top-N movers. The danger: with too many entities, the lines tangle. Filter to top 10-15 max. Color matters: assign a stable color per entity throughout, never reuse colors across entities. Always sort the Y axis so 1 is at top (rank order). And explain the chart in the title — many readers haven't seen bump charts and won't intuit it.",
    use_cases: "- **Sports standings over a season**\n- **Market share rankings** quarter-over-quarter\n- **Top-N performers** changing over time"
  },
  "box-plot": {
    senior_take: "A box plot encodes a distribution into 5 numbers: min, Q1, median, Q3, max — plus outliers. It's the chart for 'show me the spread.' Great for comparing distributions across categories (test scores by school, response times by server). The trap is that audiences who haven't seen box plots before find them mystifying — always explain in the title or a side legend. For very small N (under ~20 per group), use a strip plot or beeswarm instead, since box plots imply more data than you have."
  },
  funnel: {
    senior_take: "Funnel charts visualize a conversion sequence — visitors → leads → opportunities → closed. The visual metaphor is intuitive: each stage narrower than the last. But funnels often misrepresent: the *visual width* doesn't always match the *actual ratio* unless you're careful. For honest analysis, a horizontal bar chart with the same data is usually clearer. Use funnels when you're presenting to a non-technical audience that recognizes the shape, not when you need to support rigorous analysis."
  },
  gantt: {
    senior_take: "Gantt charts show duration: each row is a task or entity, each bar spans start → end. They scale to hundreds of rows if you give the user filters. Use them for project plans (the original use case), but also for any 'event with duration' data — server uptime windows, employee tenure, contract terms. The classic mistake is putting Gantt in a dashboard with no filtering — anyone with 100+ items will scroll past. Add a date range filter and category facets, always."
  },
  scatter: {
    senior_take: "A scatter plot is the workhorse of two-variable analysis: each point's X-Y position encodes two measures. Use it to find correlation, clusters, or outliers. The trap is overcrowding: at 1000+ points, you can't see clusters anymore — use density encoding (alpha or 2D histogram) instead. Color is for a third dimension (category). Size is for a fourth (magnitude). Putting all four to work makes a powerful multivariate chart, but takes practice to read; for executive audiences, scatter with just X/Y is plenty."
  },
  bubble: {
    senior_take: "A bubble chart is a scatter plot with size encoding a third variable. They're visually appealing but read poorly: *humans compare area badly*. Bubble of double the area looks 'a bit bigger', not 2×. Use bubbles when (a) the size dimension is roughly logarithmic (population, GDP, market cap — orders of magnitude), and (b) you want to convey order-of-magnitude differences, not precise ratios. For precise comparison, use a regular scatter and put the third dimension on color or a small multiple."
  },
  donut: {
    senior_take: "A donut chart is a pie with the middle cut out. The space is usually for a center label (total, KPI). Donuts inherit all the readability problems of pies: humans compare angles badly. The center label can carry useful info. Use them for *single-glance* communication: 'we hit 75% of the target', not for detailed comparison. With more than 5 slices, switch to a horizontal bar chart."
  },
  pie: {
    senior_take: "Pie charts are decoded by angle, and humans are bad at angles. The chart-shaming brigade is right about most pies — a horizontal bar chart conveys the same data more accurately. That said, pies do work for two specific cases: (1) part-to-whole at a glance when there are 2-3 categories and the proportions are dramatic (40/30/30 reads fine), or (2) communicating proportion to a non-analytical audience that intuits pies. For everything else, use a bar."
  },
  map: {
    senior_take: "A choropleth or marker map encodes geography directly — each region or point is placed on a real map. Great for 'where is this happening' questions. The trap: country and state-level choropleths over-represent large empty areas (the 'Alaska effect'), under-represent dense small regions, and make small-multiples impossible. If geographic accuracy isn't critical, use a hex tile map. Color scales: sequential (light → dark) for absolute magnitudes; diverging (red ↔ blue) when there's a meaningful midpoint."
  },
  bar: {
    senior_take: "Bar charts are the most underrated chart type. They're boring, which is a feature: humans decode length better than any other visual property. Almost any 'show me X by Y' question is best answered with a bar. The few choices that matter: (a) horizontal for long category labels, vertical for time, (b) sort by value, not alphabetically, (c) start the axis at zero. Reach for bar charts when 'this looks too simple' is the only objection — that's a sign you've made the right call."
  },
  column: {
    senior_take: "Column charts are vertical bars — same principle. The convention is to use columns for time on the X axis (months, quarters, years) and horizontal bars for categories. Column charts compress poorly when label text is long; if your X labels need to rotate, switch to horizontal bars."
  },
  line: {
    senior_take: "Line charts are for showing change over a continuous variable — usually time. They scale beautifully: you can fit 5-10 lines without losing legibility (more with smart color/labeling). The mistake people make is treating discrete categories as a 'line' (months on X is fine; product names is not — use bars). Don't connect lines through missing data; gap them. For comparing across many series, small multiples beat overlay charts."
  },
  area: {
    senior_take: "An area chart is a line chart with the area below filled. Adds visual weight to magnitude. Use them for *stacked* area when showing total + composition over time (revenue stacked by product line). Standalone area charts (one fill) rarely add anything over a line — the fill takes ink without adding meaning. The trap with stacked area: when one series dominates, the others become invisible squiggles at the top. Switch to 100% stacked area when you want to see *composition* rather than absolute totals."
  },
  "stacked-bar": {
    senior_take: "A stacked bar shows part-to-whole composition for each category. Total height = total quantity, segments = composition. Great for 'how is each customer's spend distributed across products' type questions. The trap: when categories have very different totals, the smaller bars become impossible to read for composition. Switch to 100% stacked when composition matters more than absolute totals."
  },
  histogram: {
    senior_take: "A histogram shows the distribution of a single continuous variable by binning into intervals. Critical choices: bin count (too few hides structure, too many is noise; ~10-30 is usually right) and bin alignment (don't let bin edges fall on meaningful values like 0 or round numbers if they distort). Histograms reveal skew, multimodality, and outliers that a 'mean ± SD' summary hides. Always compute and label N — small samples don't deserve detailed binning."
  },
  density: {
    senior_take: "A density plot is a smoothed histogram — kernel density estimate (KDE). It looks elegant but is dangerous: the smoothing parameter changes the shape, and most defaults over-smooth. For analytical work, prefer a histogram (you can see the actual bins). For presentation to non-technical audiences, density plots read as 'shape of the distribution' more intuitively. Compare distributions by overlaying 2-4 density curves — beyond that, use small multiples."
  },
  kpi: {
    senior_take: "A KPI card (or BAN — Big-Ass Number) is the simplest viz: one number, one label, optionally one trend indicator. They dominate dashboards because executives scan, not read. The trap is putting too many KPIs on one screen — past 8-10, attention scatters. Pair each KPI with a sparkline or a small comparison ('vs target', 'vs last month'). And size matters: the headline number should be 3-5x the label size, otherwise the eye doesn't know what to focus on."
  },
  calendar: {
    senior_take: "Calendar heatmaps show daily values laid out in a calendar grid — like GitHub's contribution chart. Brilliant for showing seasonality, day-of-week patterns, and gaps. The danger: with low-intensity data, most cells look the same and the visual loses meaning. Use a sequential color scale with a clear floor (zero = blank or very light). Always include the year/month axis labels — calendars without dates are puzzles."
  },
  cohort: {
    senior_take: "Cohort analysis groups users by their start date (sign-up week, first purchase month) and tracks behavior over subsequent periods. The visual is usually a heatmap: rows = cohort, columns = periods since start. Reveals whether retention is improving over time (compare top rows to bottom) and where in the lifecycle people churn (look across rows). The trap is small cohort sizes — when N < 30, % values become noisy. Always show absolute N alongside %.\n"
  },
  network: {
    senior_take: "Network diagrams show entities (nodes) and relationships (edges). Beautiful for small graphs, almost useless for large ones (the 'hairball' problem). Use them when (a) the graph has ~50 or fewer nodes, (b) the *structure* matters (clusters, central nodes), and (c) the audience will explore interactively. For larger graphs, summary statistics (degree distribution, modularity) communicate the structure better than a drawing."
  },
  "parallel-coords": {
    senior_take: "Parallel coordinate plots show multivariate data: each variable gets a vertical axis, each row is a polyline crossing all axes. They reveal patterns and outliers across 5-20 dimensions, which no other chart does well. The catch: untrained readers find them overwhelming. Always include axis reordering and brushing in the interactive version. Color a few highlighted lines to make a specific story visible against the background traffic."
  },
  beeswarm: {
    senior_take: "A beeswarm plot shows every data point in a one-dimensional swarm, jittered to avoid overlap. It's a more honest alternative to a box plot when N is small — you see the actual data, not summary statistics. Use it when the *individual points* matter (each one is a real entity worth seeing). Caps out around 200 points per group; beyond that, switch to density or histogram."
  },
  waffle: {
    senior_take: "A waffle chart shows part-to-whole as a 10×10 grid of squares — '37%' becomes 37 filled squares. Easier to read than a pie for non-experts; the discrete squares make the number concrete. Great for single proportions ('we hit 73% of target') in marketing or executive contexts. Limited to one or two proportions per waffle; don't try to encode 5 categories in one grid."
  },
  "tile-map": {
    senior_take: "A tile map is a generalization of hex tile maps — usually square tiles arranged in a rough approximation of geography. Same use case (equal weight per region), simpler aesthetic. Tile maps work especially well for US state data because the grid layout reads as 'east-west / north-south' even when distorted. Use the standard NPR / Pitch Interactive layout, not your own — readers recognize it."
  },
  "choropleth": {
    senior_take: "A choropleth fills geographic regions with color encoding a quantity. The classic 'state by % of vote' or 'county by income' map. Choropleths over-weight large empty regions and under-weight small dense ones — this distortion can mislead. For *rate* data (per capita, %), choropleth is honest. For *count* data (total population), choropleth lies; use bubbles or a dot density map instead."
  },
  timeline: {
    senior_take: "Timeline charts plot events on a date axis. Use them for narrative — 'here's what happened when'. Great in retrospectives, post-mortems, milestone presentations. Critical: keep the timeline horizontal, label events directly on the bars (avoid floating annotations that pull the eye away), and pick a date range that gives breathing room to each event."
  },
  lollipop: {
    senior_take: "A lollipop chart is a bar chart with the bar replaced by a thin line and a circle at the end. Visually lighter than bars; works when you have many categories and don't want a wall of color. The dot draws the eye to the value, the thin stem keeps the rest of the chart calm. Use lollipops when you want a 'softer' look — editorial, presentation, slide deck — rather than analytical density."
  },
  "word-cloud": {
    senior_take: "Word clouds encode word frequency as font size. They look engaging but they're terrible for analysis: humans can't compare font sizes accurately, and the layout algorithm prioritizes packing over meaning. Use them only for *first-glance impressions* — 'what are people talking about, broadly'. For actual analysis of text frequency, a bar chart of top 20 terms is dramatically more useful."
  }
};

// =====================================================================

function sqlEscape(s) {
  if (s === null || s === undefined) return "null";
  // Use E'' syntax for escape strings so \n works
  return "E'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/\n/g, "\\n") + "'";
}

function arrayLiteral(arr) {
  if (!arr || arr.length === 0) return "ARRAY[]::text[]";
  return "ARRAY[" + arr.map((s) => sqlEscape(s)).join(",") + "]";
}

function buildInsert(t) {
  const content = CONTENT[t.chart_type] ?? null;
  const tier = t.content_tier;

  // Tier 1: full content + (manual annotation later)
  // Tier 2: senior_take + use_cases + anti_patterns
  // Tier 3: senior_take only
  let senior_take = null, use_cases = null, anti_patterns = null, pitfalls = null, annotation = null;
  if (content) {
    senior_take = content.senior_take;
    if (tier <= 2) {
      use_cases = content.use_cases ?? null;
      anti_patterns = content.anti_patterns ?? null;
    }
    if (tier === 1) {
      pitfalls = content.pitfalls ?? null;
    }
  }
  if (tier === 1 && !annotation) {
    annotation = `## Source\n\nThis template is embedded from Tableau Public. Open the workbook from the link below to inspect the XML and calculations directly. Each chart's structure varies; the key calculations for **${t.chart_type}** are documented in the senior-take section above.`;
  }

  return `(
    ${sqlEscape(t.slug)},
    ${sqlEscape(t.name)},
    ${sqlEscape(t.name)},
    ${sqlEscape(t.chart_type)},
    ${sqlEscape(t.difficulty)},
    ${tier === 1 ? 30 : tier === 2 ? 20 : 15},
    ${sqlEscape(t.tableau_public_url)},
    null,
    ${sqlEscape(t.thumbnail_url)},
    ${sqlEscape(annotation ?? '')},
    ${arrayLiteral([t.chart_type])},
    ${sqlEscape(t.author_name)},
    ${sqlEscape(t.author_profile_url)},
    ${sqlEscape("Embedded from Tableau Public. All rights to the original author. Commentary by TableauKit.")},
    ${sqlEscape(use_cases)},
    ${sqlEscape(anti_patterns)},
    ${sqlEscape(senior_take)},
    ${sqlEscape(pitfalls)},
    ${tier},
    true,
    now()
  )`;
}

function main() {
  const templates = JSON.parse(readFileSync(IN, "utf8"));
  console.log(`Generating SQL for ${templates.length} templates...`);

  const header = `-- Mass-seeded templates (Phase 2).
-- Generated by scripts/seed-templates.mjs from tmp/template-curated.json.
-- All templates embed Tableau Public viz; senior-analyst content per chart_type
-- is from scripts/seed-templates.mjs CONTENT library.

`;

  const columns = `INSERT INTO tk_templates (
  slug, name, subtitle, chart_type, difficulty, build_time_min,
  tableau_public_url, twbx_storage_path, preview_image_url,
  annotation_md, tags, author_name, author_profile_url, license_note,
  use_cases_md, anti_patterns_md, senior_take_md, pitfalls_md,
  content_tier, is_published, published_at
) VALUES`;

  const allRows = templates.map(buildInsert).join(",\n");
  const fullSql = header + columns + "\n" + allRows + "\nON CONFLICT (slug) DO NOTHING;\n";

  if (!existsSync("supabase/seeds")) mkdirSync("supabase/seeds", { recursive: true });
  writeFileSync(OUT, fullSql);
  console.log(`→ ${OUT} (${(fullSql.length / 1024).toFixed(1)}KB)`);

  // Also write batched files for MCP execution
  if (!existsSync(BATCH_DIR)) mkdirSync(BATCH_DIR, { recursive: true });
  for (let i = 0; i < templates.length; i += BATCH_SIZE) {
    const batch = templates.slice(i, i + BATCH_SIZE);
    const rows = batch.map(buildInsert).join(",\n");
    const sql = columns + "\n" + rows + "\nON CONFLICT (slug) DO NOTHING;\n";
    const path = `${BATCH_DIR}/batch-${String(Math.floor(i / BATCH_SIZE) + 1).padStart(2, "0")}.sql`;
    writeFileSync(path, sql);
    console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} rows → ${path}`);
  }
}

main();
