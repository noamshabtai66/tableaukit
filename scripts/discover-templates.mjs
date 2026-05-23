#!/usr/bin/env node
// Hit the Tableau Public undocumented JSON API for a curated list of authors
// and collect their top workbooks. Output: tmp/template-candidates.json
//
// API contract (verified live 2026-05-22, docs at github.com/wjsutton/tableau_public_api):
//   GET https://public.tableau.com/public/apis/workbooks
//     ?profileName={name}&start=0&count=50&visibility=NON_HIDDEN
//
// Throttle: 1 req/sec to be polite to undocumented API.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "tmp/template-candidates.json";
const PER_AUTHOR_LIMIT = 50;
const SLEEP_MS = 1000;

// Hand-curated author seed list: Hall of Fame, Visionaries, Ambassadors,
// and authors we already used in Phase 1.
const AUTHORS = [
  // Phase 1 authors (will be deduped)
  "ken.flerlage",
  "matt.chambers",
  // Visionaries (Tableau community leaders, prolific publishers)
  "andy.kriebel",
  "ryan.sleeper",
  "jeffrey.shaffer",
  "shine.pulikathara",
  "rody.zakovich",
  "lindsey.poulter",
  "samuel.parsons",
  "kevin.flerlage",
  "luke.stanke",
  "yvan.fornes",
  "ann.jackson",
  "lorna.eden",
  "alex.varlamov",
  "soha.elghany",
  "klaus.schulte",
  "judit.bekker",
  // Ambassadors & frequent publishers
  "sarah.bartlett",
  "donna.coles",
  "neil.richards",
  "pradeep.kumar.g",
  "chris.demartini",
  "rajeev.pandey",
  "spencer.baucke",
  "tristan.guillevin",
  "marc.reid",
  "kasia.gasiewska.holc",
  "lilach.manheim",
  "adam.crahen",
  "yvon.macedo",
  "robert.crocker",
  "frederic.fery",
  "satoshi.ganeko",
  "lisa.trescott",
  "carl.allchin",
  "mark.bradbourne",
  "sebastian.werner",
];

async function fetchAuthor(profileName) {
  const url = `https://public.tableau.com/public/apis/workbooks?profileName=${encodeURIComponent(profileName)}&start=0&count=${PER_AUTHOR_LIMIT}&visibility=NON_HIDDEN`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "tableaukit-discovery/0.1 (contact: noam@tableaukit)" },
    });
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for ${profileName}`);
      return [];
    }
    const json = await res.json();
    return json.contents ?? json.workbooks ?? [];
  } catch (err) {
    console.error(`  fetch error for ${profileName}: ${err.message}`);
    return [];
  }
}

function extractSheet(defaultViewRepoUrl) {
  // Format: "Workbook/sheets/SheetName" → "SheetName"
  if (!defaultViewRepoUrl) return null;
  const parts = defaultViewRepoUrl.split("/sheets/");
  return parts.length > 1 ? parts[1] : defaultViewRepoUrl.split("/").pop();
}

function buildThumbnail(workbookRepoUrl, sheet) {
  if (!workbookRepoUrl || !sheet) return null;
  const prefix = workbookRepoUrl.slice(0, 2);
  return `https://public.tableau.com/static/images/${prefix}/${workbookRepoUrl}/${sheet}/4_3_hd.png`;
}

function slugify(s) {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function main() {
  console.log(`Discovering templates from ${AUTHORS.length} authors...`);
  const all = [];

  for (const author of AUTHORS) {
    process.stdout.write(`  ${author} ... `);
    const workbooks = await fetchAuthor(author);
    console.log(`${workbooks.length} workbooks`);

    for (const wb of workbooks) {
      const repoUrl = wb.workbookRepoUrl;
      const sheet = extractSheet(wb.defaultViewRepoUrl);
      if (!repoUrl || !sheet) continue;

      const thumb = buildThumbnail(repoUrl, sheet);
      all.push({
        slug: slugify(`${author}-${repoUrl}-${sheet}`),
        name: wb.title ?? repoUrl,
        tableau_public_url: `https://public.tableau.com/views/${repoUrl}/${sheet}`,
        author_name: wb.authorDisplayName ?? author,
        author_profile_url: `https://public.tableau.com/app/profile/${wb.authorProfileName ?? author}`,
        view_count: wb.viewCount ?? 0,
        favorites_count: wb.numberOfFavorites ?? 0,
        thumbnail_url: thumb,
        workbook_repo: repoUrl,
        default_view: sheet,
        default_view_name: wb.defaultViewName ?? sheet,
      });
    }

    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }

  // Dedupe by (workbook_repo, default_view)
  const seen = new Set();
  const deduped = all.filter((t) => {
    const key = `${t.workbook_repo}::${t.default_view}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!existsSync(dirname(OUT))) mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(deduped, null, 2));
  console.log(`\n${all.length} workbooks fetched, ${deduped.length} unique → ${OUT}`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
