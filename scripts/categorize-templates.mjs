#!/usr/bin/env node
// Read tmp/template-candidates.json, filter, categorize, tier-assign.
// Output: tmp/template-curated.json (target ~100 entries).

import { readFileSync, writeFileSync } from "node:fs";

const IN = "tmp/template-candidates.json";
const OUT = "tmp/template-curated.json";

const TARGET_COUNT = 100;
const MIN_VIEWS = 500;
const EXISTING_SLUGS_DEDUPE = ["sankey-multi-level", "dumbbell", "bullet", "hex-tile-map"];

// chart_type → matched by keywords in title (case-insensitive, first match wins)
// Order matters: more specific patterns first.
const CHART_TYPE_RULES = [
  [/\bsankey\b/i, "sankey"],
  [/\bchord\b/i, "chord"],
  [/\bradial\b/i, "radial"],
  [/\bsunburst\b/i, "sunburst"],
  [/\bmarimekko|mekko\b/i, "marimekko"],
  [/\bparallel\b/i, "parallel-coords"],
  [/\bbump\b/i, "bump"],
  [/\bviolin\b/i, "violin"],
  [/\bbox\s*plot|boxplot\b/i, "box-plot"],
  [/\bbeeswarm\b/i, "beeswarm"],
  [/\bwaffle\b/i, "waffle"],
  [/\bhex(\s*tile)?(\s*map)?\b/i, "hex-map"],
  [/\bchoropleth\b/i, "choropleth"],
  [/\btile\s*map\b/i, "tile-map"],
  [/\bgantt\b/i, "gantt"],
  [/\btimeline\b/i, "timeline"],
  [/\bdumbbell|barbell\b/i, "dumbbell"],
  [/\blollipop\b/i, "lollipop"],
  [/\bslope\b/i, "slope"],
  [/\bbullet\b/i, "bullet"],
  [/\bwaterfall\b/i, "waterfall"],
  [/\bspark\s*line|sparkline\b/i, "sparkline"],
  [/\btreemap\b/i, "treemap"],
  [/\bheat\s*map|heatmap\b/i, "heatmap"],
  [/\bcalendar\b/i, "calendar"],
  [/\bdonut|doughnut\b/i, "donut"],
  [/\bpie\b/i, "pie"],
  [/\bbubble\b/i, "bubble"],
  [/\bnetwork\b/i, "network"],
  [/\bword\s*cloud\b/i, "word-cloud"],
  [/\bfunnel\b/i, "funnel"],
  [/\bcohort\b/i, "cohort"],
  [/\bdensity\b/i, "density"],
  [/\bscatter\b/i, "scatter"],
  [/\bhistogram\b/i, "histogram"],
  [/\barea\b/i, "area"],
  [/\bstacked\s*bar\b/i, "stacked-bar"],
  [/\bbar\s*chart|barchart\b/i, "bar"],
  [/\bcolumn\b/i, "column"],
  [/\bline\s*chart\b/i, "line"],
  [/\bkpi|ban\b/i, "kpi"],
  [/\bmap\b/i, "map"],
];

const DIFFICULTY_BY_TYPE = {
  sankey: "advanced",
  chord: "advanced",
  radial: "advanced",
  sunburst: "advanced",
  marimekko: "advanced",
  "parallel-coords": "advanced",
  bump: "advanced",
  beeswarm: "advanced",
  network: "advanced",
  violin: "intermediate",
  "box-plot": "intermediate",
  waffle: "intermediate",
  "hex-map": "intermediate",
  choropleth: "intermediate",
  "tile-map": "intermediate",
  gantt: "intermediate",
  timeline: "intermediate",
  dumbbell: "intermediate",
  lollipop: "intermediate",
  slope: "intermediate",
  bullet: "intermediate",
  waterfall: "intermediate",
  sparkline: "intermediate",
  treemap: "intermediate",
  heatmap: "intermediate",
  calendar: "intermediate",
  funnel: "intermediate",
  cohort: "intermediate",
  density: "intermediate",
  donut: "beginner",
  pie: "beginner",
  bubble: "beginner",
  scatter: "beginner",
  histogram: "beginner",
  area: "beginner",
  "stacked-bar": "beginner",
  bar: "beginner",
  column: "beginner",
  line: "beginner",
  kpi: "beginner",
  map: "beginner",
  "word-cloud": "beginner",
  other: "intermediate",
};

const TUTORIAL_PATTERN = /\b(how\s+to|tutorial|step[-\s]by[-\s]step|guide\s+to|exercise|practice|day\s+\d+|week\s+\d+|wow\s*\d+|workout\s+wednesday)\b/i;
const DASHBOARD_PATTERN = /\b(dashboard|overview\s+dashboard|executive\s+dashboard|analytics\s+dashboard|story|presentation)\b/i;

function categorize(title) {
  for (const [pattern, type] of CHART_TYPE_RULES) {
    if (pattern.test(title)) return type;
  }
  return "other";
}

function assignTier(template, perTypeCount, currentByType) {
  // Tier 1 (flagship): top 1 per major chart type by views (10 types max)
  // Tier 2 (deep): next 2-3 per major type
  // Tier 3 (basic): remaining
  const FLAGSHIP_TYPES = ["sankey", "sparkline", "dumbbell", "hex-map", "bullet", "waterfall", "treemap", "heatmap", "slope", "marimekko"];
  const count = currentByType.get(template.chart_type) ?? 0;

  if (FLAGSHIP_TYPES.includes(template.chart_type) && count === 0) {
    return 1; // first one of a flagship type
  }
  if (FLAGSHIP_TYPES.includes(template.chart_type) && count <= 3) {
    return 2; // next few of flagship types
  }
  if (count <= 1) {
    return 2; // first of secondary types is deep
  }
  return 3;
}

function main() {
  const raw = JSON.parse(readFileSync(IN, "utf8"));
  console.log(`Loaded ${raw.length} candidates`);

  // 1. Filter
  let filtered = raw.filter((t) => {
    if (!t.tableau_public_url || !t.thumbnail_url) return false;
    if (t.view_count < MIN_VIEWS) return false;
    if (TUTORIAL_PATTERN.test(t.name)) return false;
    if (DASHBOARD_PATTERN.test(t.name) && t.favorites_count < 50) return false;
    if (EXISTING_SLUGS_DEDUPE.some((s) => t.slug.includes(s))) return false;
    return true;
  });
  console.log(`  ${filtered.length} after filtering (views >= ${MIN_VIEWS}, no tutorials)`);

  // 2. Categorize
  filtered.forEach((t) => {
    t.chart_type = categorize(t.name);
    t.difficulty = DIFFICULTY_BY_TYPE[t.chart_type] ?? "intermediate";
  });

  // 3. Drop "other" overflow — keep only top 20 by views since they're uncategorized
  const other = filtered.filter((t) => t.chart_type === "other").sort((a, b) => b.view_count - a.view_count).slice(0, 20);
  const categorized = filtered.filter((t) => t.chart_type !== "other");
  filtered = [...categorized, ...other];
  console.log(`  ${categorized.length} categorized + ${other.length} other = ${filtered.length}`);

  // 4. Sort by views (desc) within each chart type, then assign tiers
  const byType = new Map();
  for (const t of filtered) {
    if (!byType.has(t.chart_type)) byType.set(t.chart_type, []);
    byType.get(t.chart_type).push(t);
  }
  for (const arr of byType.values()) arr.sort((a, b) => b.view_count - a.view_count);

  // 5. Round-robin across types to keep variety, assign tier per template
  const result = [];
  const counts = new Map();
  let added = true;
  while (added && result.length < TARGET_COUNT) {
    added = false;
    for (const [type, arr] of byType) {
      if (result.length >= TARGET_COUNT) break;
      const idx = counts.get(type) ?? 0;
      if (idx >= arr.length) continue;
      const t = arr[idx];
      t.content_tier = assignTier(t, byType.size, counts);
      result.push(t);
      counts.set(type, idx + 1);
      added = true;
    }
  }

  // Stats
  const typeStats = {};
  const tierStats = { 1: 0, 2: 0, 3: 0 };
  for (const t of result) {
    typeStats[t.chart_type] = (typeStats[t.chart_type] ?? 0) + 1;
    tierStats[t.content_tier]++;
  }
  console.log(`\nFinal: ${result.length} templates`);
  console.log(`  Tiers: T1=${tierStats[1]} T2=${tierStats[2]} T3=${tierStats[3]}`);
  console.log(`  Types:`, Object.entries(typeStats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" "));

  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`→ ${OUT}`);
}

main();
