# TableauKit

Open-source library of annotated Tableau `.twbx` visualization templates + MCP server.

## What this project is

A curated gallery of canonical Tableau chart templates (sankey, hex map, sparkline, dumbbell, bullet, waterfall, gantt, etc.) where every template ships with:

- A working `.twbx` file
- A sample CSV that opens cleanly in Tableau Desktop 2024+
- **Line-by-line XML annotation explaining HOW the template works** ← the moat
- An MCP server exposing the library to Claude/Cursor/VS Code

## What this project is NOT

- Not another autonomous "CSV → dashboard" engine (that was `tableau-cli`, which we pivoted away from — see [[engine_quality_findings_2026_05]] in auto-memory)
- Not a paid subscription product (Tailwind UI lost 80% revenue to AI in 2026 — that model is dead)
- Not a marketing-only site (the templates and annotations ARE the product)

## Stack

- **Astro 5** + MDX for content
- **Tailwind CSS** with custom design tokens (see `tailwind.config.mjs`)
- **Public Sans** (sans) + **JetBrains Mono** (mono) from Google Fonts
- **MCP server** (Node) — added in week 4 under `mcp/`

## Repo layout

```
src/
  pages/         — Astro routes (index.astro = landing, templates/[slug].astro = detail)
  components/    — Nav, Hero, ValueProps, TemplateGrid, McpCallout, Footer
  content/       — Astro content collections (templates as MDX)
  layouts/       — Base Layout.astro
  styles/        — globals.css
public/          — favicon, og-image, static assets
docs/references/ — Tableau XML pattern references (copied from tableau-cli, READ-ONLY)
core/            — Python utilities for building/validating .twb XML
  builder.py     — copied from tableau-cli/engine/twb_builder_v2.py
  model.py       — copied from tableau-cli/engine/workbook_model.py
templates/       — Source .twb files + sample CSVs per template
  sankey/
    template.twb
    sample.csv
    annotation.md
mcp/             — MCP server (week 4)
```

## Working defaults

- **Design tokens are locked** — see `tailwind.config.mjs`. Do not introduce raw hex in components; use the `brand.*`, `ink.*`, `app`, `panel`, `line` tokens.
- **Public Sans + JetBrains Mono only.** No system fonts. Load via Google Fonts in `Layout.astro`.
- **MDX templates are the source of truth** — landing page lists are built from content collections, not hardcoded.
- **Each template = self-contained folder** under `templates/<name>/` with .twb + sample CSV + annotation.md. The Astro page reads annotation.md and renders it.
- **XML annotation is the moat.** Every template MUST have line-by-line annotation explaining the XML, not just a high-level description.
- **Validate .twb files** before commit — open in Tableau Desktop 2024+ and confirm no DD3C47AE / D2E8DA72 errors. See `docs/references/error-codes-and-pitfalls.md`.

## Design system summary

Brand colors:

- Primary blue: `#2563eb` (CTAs, links, "explained" highlight word)
- Navy strong: `#0b1220` (footer, MCP dark strip)
- Backgrounds: `#f3f4f6` (page), `#ffffff` (panels)
- Border: `#d8e1ee`
- Text: `#111b2f` strong, `#1e293b` body, `#6b7280` muted

Radii: 8/12/18/22/28 px
Shadows: very subtle — `soft` for cards, `card` for elevated, `hero` for the preview card
Vibe: Linear / Stripe / Vercel B2B SaaS. NOT shadcn-dark. NOT Apple-strict.

## How a new template is added

1. Build the .twbx in Tableau Desktop (or via `core/builder.py`)
2. Place under `templates/<slug>/template.twb` + `sample.csv`
3. Write `annotation.md` — line-by-line XML walkthrough (this is the moat)
4. Add MDX entry under `src/content/templates/<slug>.mdx` with frontmatter (title, chart_type, difficulty, build_time_min, sample_csv_columns, etc.)
5. Run `npm run build` and verify the template page renders
6. Commit + PR

## MCP server (week 4)

Located under `mcp/`. Exposes 4 tools:

- `list_templates(filter?)` → list all available templates with metadata
- `get_template(slug)` → returns `.twb` snippet + sample.csv + annotation
- `explain_xml(slug)` → returns just the annotation for a template
- `adapt_to_csv(slug, schema)` → adapts a template's calculations to a user's column names

## Hard rules

- **Do not import from `tableau-cli`** — that project is archived. Copy files explicitly.
- **Do not add a "$X/month subscription" tier.** This is open source. Monetization is consulting / sponsorship / enterprise B2B.
- **Do not autonomously decide chart designs from a CSV.** That was the engine direction; it failed. This project is curated templates only.
- **Do not commit secrets** — there shouldn't be any. Public + MIT.

## See also

- Auto-memory: `project_tableaukit.md` (full project context across sessions)
- Auto-memory: `engine_quality_findings_2026_05.md` (why we pivoted)
- Auto-memory: `feedback_consulting_mode.md` (how user wants to work)
