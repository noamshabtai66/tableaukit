#!/usr/bin/env node
// Content QA: per-template standards check
// - Every published template must have senior_take_md (the moat)
// - chart_type must come from a known set, not "other" (or override)
// - Tier 1 must have annotation_md
// - Tier 2 must have use_cases_md + anti_patterns_md
// - Report mismatches + missing content

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const eq = l.indexOf("="); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]; }),
);
const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: templates } = await supabase
    .from("tk_templates")
    .select("slug, name, chart_type, content_tier, senior_take_md, use_cases_md, anti_patterns_md, pitfalls_md, annotation_md, author_name")
    .eq("is_published", true);

  const issues = [];
  for (const t of templates) {
    const r = { slug: t.slug, name: t.name, tier: t.content_tier, type: t.chart_type, problems: [] };
    if (!t.senior_take_md || t.senior_take_md.length < 100) r.problems.push("missing/short senior_take");
    if (t.chart_type === "other") r.problems.push("chart_type=other (uncategorized)");
    if (!t.author_name) r.problems.push("missing author");
    if (t.content_tier === 1 && (!t.annotation_md || t.annotation_md.length < 50)) r.problems.push("T1 missing annotation");
    if (t.content_tier === 1 && !t.pitfalls_md) r.problems.push("T1 missing pitfalls");
    if (t.content_tier <= 2 && !t.use_cases_md) r.problems.push("T1/T2 missing use_cases");
    if (t.content_tier <= 2 && !t.anti_patterns_md) r.problems.push("T1/T2 missing anti_patterns");
    if (r.problems.length > 0) issues.push(r);
  }

  // Summarize
  const counts = {};
  for (const r of issues) for (const p of r.problems) counts[p] = (counts[p] ?? 0) + 1;

  console.log(`Total published: ${templates.length}`);
  console.log(`Templates with at least one content issue: ${issues.length}\n`);
  console.log("Issue breakdown:");
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v.toString().padStart(4)} × ${k}`));

  console.log("\nSample of templates with most issues (top 15):");
  issues.sort((a, b) => b.problems.length - a.problems.length).slice(0, 15).forEach((r) => {
    console.log(`  [${r.tier}] ${r.slug.slice(0, 60).padEnd(60)} | ${r.problems.join(", ")}`);
  });

  // Group "other" templates so we can author rules
  const others = templates.filter((t) => t.chart_type === "other");
  if (others.length > 0) {
    console.log(`\n${others.length} templates with chart_type='other' (need re-categorization or generic content):`);
    others.slice(0, 15).forEach((t) => console.log(`  - ${t.name.slice(0, 70)}`));
    if (others.length > 15) console.log(`  ... and ${others.length - 15} more`);
  }

  writeFileSync("tmp/qa-content-report.json", JSON.stringify({ total: templates.length, issues, counts }, null, 2));
  console.log(`\nReport: tmp/qa-content-report.json`);
}

main().catch((err) => { console.error("fatal:", err); process.exit(1); });
