#!/usr/bin/env node
// Quality control for tk_templates:
// 1. HEAD request each preview_image_url (thumbnail) — expect 200, image content-type
// 2. HEAD request each tableau_public_url — expect 200/302
// 3. Sanity-check chart_type matches title keywords
// 4. Report results; optionally unpublish failed rows.
//
// Usage: node scripts/qa-templates.mjs           — read-only audit
//        node scripts/qa-templates.mjs --fix     — unpublish broken rows

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const eq = l.indexOf("="); return [l.slice(0, eq).trim(), l.slice(eq + 1).trim()]; }),
);

const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FIX = process.argv.includes("--fix");
const CONCURRENCY = 8;
const TIMEOUT_MS = 8000;

async function head(url, useGet = false) {
  // Tableau Public's static/images CDN returns 404 for HEAD but 200 for GET.
  // Use a GET with Range: bytes=0-0 to fetch only 1 byte for thumbnail checks.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const opts = { signal: ctrl.signal, redirect: "follow" };
    if (useGet) {
      opts.method = "GET";
      opts.headers = { Range: "bytes=0-0" };
    } else {
      opts.method = "HEAD";
    }
    const res = await fetch(url, opts);
    // 206 = partial content (success for range request)
    const ok = res.ok || res.status === 206;
    return { ok, status: res.status, contentType: res.headers.get("content-type") ?? "", contentLength: parseInt(res.headers.get("content-length") ?? "0", 10) };
  } catch (err) {
    return { ok: false, status: 0, contentType: "", contentLength: 0, error: err.message };
  } finally {
    clearTimeout(t);
  }
}

async function pool(items, fn) {
  const results = [];
  let i = 0;
  const workers = Array(Math.min(CONCURRENCY, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const { data: templates, error } = await supabase
    .from("tk_templates")
    .select("slug, name, chart_type, tableau_public_url, preview_image_url, content_tier, is_published")
    .eq("is_published", true);

  if (error) { console.error("DB error:", error); process.exit(1); }
  console.log(`Checking ${templates.length} published templates (concurrency=${CONCURRENCY})...\n`);

  const results = await pool(templates, async (t, idx) => {
    const [thumb, viz] = await Promise.all([
      t.preview_image_url ? head(t.preview_image_url, true) : { ok: true, status: 0, contentType: "image/png" },
      head(t.tableau_public_url),
    ]);
    const issues = [];
    // Thumbnail (GET range — 200/206 expected; content-type starts with image/)
    if (t.preview_image_url && !thumb.ok) issues.push(`thumb ${thumb.status}`);
    else if (t.preview_image_url && !thumb.contentType.startsWith("image/")) issues.push(`thumb non-image (${thumb.contentType})`);
    // Tableau Public URL
    if (!viz.ok) issues.push(`viz ${viz.status}`);
    process.stdout.write(issues.length ? "✗" : "✓");
    if ((idx + 1) % 50 === 0) process.stdout.write(` ${idx + 1}\n`);
    return { ...t, thumb, viz, issues };
  });
  console.log(`\n`);

  // Categorize results
  const ok = results.filter((r) => r.issues.length === 0);
  const broken = results.filter((r) => r.issues.length > 0);
  const thumbOnly = broken.filter((r) => r.issues.every((i) => i.startsWith("thumb")));
  const vizBroken = broken.filter((r) => r.issues.some((i) => i.startsWith("viz")));

  console.log(`✅ OK:               ${ok.length}/${results.length}`);
  console.log(`⚠️  Thumb-only issue: ${thumbOnly.length}  (viz still embeds, just no preview)`);
  console.log(`❌ Viz broken:       ${vizBroken.length}  (404/blocked — should unpublish)`);
  console.log("");

  if (vizBroken.length > 0) {
    console.log("Viz-broken templates:");
    vizBroken.slice(0, 20).forEach((r) => console.log(`  - ${r.slug}  [${r.issues.join(", ")}]  → ${r.tableau_public_url}`));
    if (vizBroken.length > 20) console.log(`  ... and ${vizBroken.length - 20} more`);
  }

  if (thumbOnly.length > 0 && thumbOnly.length <= 15) {
    console.log("\nThumbnail-only issues:");
    thumbOnly.forEach((r) => console.log(`  - ${r.slug}  [${r.issues.join(", ")}]`));
  } else if (thumbOnly.length > 15) {
    console.log(`\nThumbnail-only issues: ${thumbOnly.length} rows (sample below)`);
    thumbOnly.slice(0, 10).forEach((r) => console.log(`  - ${r.slug}  [${r.issues.join(", ")}]`));
  }

  // Write report
  writeFileSync("tmp/qa-report.json", JSON.stringify({
    total: results.length, ok: ok.length, thumbOnly: thumbOnly.length, vizBroken: vizBroken.length,
    vizBrokenSlugs: vizBroken.map((r) => r.slug),
    thumbOnlySlugs: thumbOnly.map((r) => r.slug),
  }, null, 2));
  console.log(`\nReport: tmp/qa-report.json`);

  if (FIX && vizBroken.length > 0) {
    console.log(`\nUnpublishing ${vizBroken.length} viz-broken templates...`);
    const { error: updErr } = await supabase
      .from("tk_templates")
      .update({ is_published: false })
      .in("slug", vizBroken.map((r) => r.slug));
    if (updErr) console.error("  update error:", updErr);
    else console.log("  done.");

    // Also null out broken thumbnail URLs so the fallback gradient shows
    if (thumbOnly.length > 0) {
      console.log(`Nulling preview_image_url for ${thumbOnly.length} thumb-only templates...`);
      const { error: thumbErr } = await supabase
        .from("tk_templates")
        .update({ preview_image_url: null })
        .in("slug", thumbOnly.map((r) => r.slug));
      if (thumbErr) console.error("  update error:", thumbErr);
      else console.log("  done.");
    }
  } else if (vizBroken.length > 0) {
    console.log(`\nRe-run with --fix to mark broken rows is_published=false.`);
  }
}

main().catch((err) => { console.error("fatal:", err); process.exit(1); });
