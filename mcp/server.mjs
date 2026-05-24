#!/usr/bin/env node
// TableauKit MCP server.
// Exposes the gallery (`tk_templates` in Supabase) to Claude / Cursor / VS Code
// via 4 tools: list_templates, get_template, explain_xml, adapt_to_csv.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');
// Load env from the Astro project so the MCP server picks up the same Supabase
// creds the site uses. Real env vars always win over the file values.
loadEnv({ path: join(projectRoot, '.env.local') });
loadEnv({ path: join(projectRoot, '.env') });

const SUPABASE_URL =
  process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    '[tableaukit-mcp] Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY. ' +
      'Set them in env or in <project>/.env.local.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEMPLATES_TABLE = 'tk_templates';

const ok = (obj) => ({
  content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
});
const text = (msg) => ({ content: [{ type: 'text', text: msg }] });
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });

const server = new McpServer({
  name: 'tableaukit',
  version: '0.1.0',
});

// -------------------------------------------------------------------------
// list_templates
// -------------------------------------------------------------------------
server.tool(
  'list_templates',
  'List published TableauKit templates. Optionally filter by chart_type, difficulty, and/or content_tier. Returns a compact list — call get_template(slug) for full content.',
  {
    chart_type: z
      .string()
      .optional()
      .describe(
        'Filter by chart type (lower-case), e.g. "sankey", "heatmap", "bullet", "waterfall", "hex-map".'
      ),
    difficulty: z
      .enum(['beginner', 'intermediate', 'advanced'])
      .optional()
      .describe('Filter by difficulty tier.'),
    content_tier: z
      .union([z.literal(1), z.literal(2), z.literal(3)])
      .optional()
      .describe(
        'Optional tier filter: 1 = flagship (full XML annotation + 4 markdown sections); 2 = deep (3 markdown sections); 3 = quick reference (senior_take prose only).'
      ),
  },
  async ({ chart_type, difficulty, content_tier }) => {
    let q = supabase
      .from(TEMPLATES_TABLE)
      .select(
        'slug,name,subtitle,chart_type,difficulty,content_tier,tableau_public_url,author_name'
      )
      .eq('is_published', true)
      .order('content_tier', { ascending: true })
      .order('slug', { ascending: true });

    if (chart_type) q = q.eq('chart_type', chart_type);
    if (difficulty) q = q.eq('difficulty', difficulty);
    if (content_tier) q = q.eq('content_tier', content_tier);

    const { data, error } = await q;
    if (error) return fail(`list_templates failed: ${error.message}`);
    return ok({ count: data.length, templates: data });
  }
);

// -------------------------------------------------------------------------
// get_template
// -------------------------------------------------------------------------
server.tool(
  'get_template',
  'Fetch a single published template by slug. Returns the full row including all markdown sections (senior_take_md, use_cases_md, anti_patterns_md, pitfalls_md, annotation_md) and author/credit info.',
  {
    slug: z
      .string()
      .min(1)
      .describe('Template slug, e.g. "sankey-multi-level", "dumbbell", "hex-tile-map".'),
  },
  async ({ slug }) => {
    const { data, error } = await supabase
      .from(TEMPLATES_TABLE)
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();

    if (error) return fail(`get_template failed: ${error.message}`);
    if (!data) return fail(`Template not found or not published: ${slug}`);
    return ok(data);
  }
);

// -------------------------------------------------------------------------
// explain_xml
// -------------------------------------------------------------------------
server.tool(
  'explain_xml',
  'Return the line-by-line XML annotation for a flagship (content_tier=1) template. Other tiers do not ship full XML annotation — for those, call get_template and read senior_take_md / use_cases_md instead.',
  {
    slug: z.string().min(1).describe('Template slug.'),
  },
  async ({ slug }) => {
    const { data, error } = await supabase
      .from(TEMPLATES_TABLE)
      .select('slug,name,content_tier,annotation_md')
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();

    if (error) return fail(`explain_xml failed: ${error.message}`);
    if (!data) return fail(`Template not found or not published: ${slug}`);

    if (data.content_tier !== 1) {
      return text(
        `Template "${slug}" is content_tier=${data.content_tier} (not flagship). ` +
          `Full XML annotation is only available for flagship (tier 1) templates. ` +
          `Use get_template("${slug}") to read its senior-analyst commentary instead.`
      );
    }

    return text(
      `# ${data.name} — XML annotation\n\n${
        data.annotation_md || '(no annotation_md on record)'
      }`
    );
  }
);

// -------------------------------------------------------------------------
// adapt_to_csv
// -------------------------------------------------------------------------
server.tool(
  'adapt_to_csv',
  "Get adaptation context for mapping a template to a user's CSV columns. Returns the template's senior-analyst notes + XML annotation + the user's column list. The calling model uses this bundle to suggest concrete calc-field renames and flag missing required columns.",
  {
    slug: z.string().min(1).describe('Template slug to adapt.'),
    columns: z
      .array(z.string().min(1))
      .min(1)
      .describe("Column names from the user's CSV (exactly as they appear in the header)."),
  },
  async ({ slug, columns }) => {
    const { data, error } = await supabase
      .from(TEMPLATES_TABLE)
      .select(
        'slug,name,chart_type,difficulty,content_tier,sample_csv_storage_path,' +
          'senior_take_md,use_cases_md,anti_patterns_md,pitfalls_md,annotation_md'
      )
      .eq('slug', slug)
      .eq('is_published', true)
      .maybeSingle();

    if (error) return fail(`adapt_to_csv failed: ${error.message}`);
    if (!data) return fail(`Template not found or not published: ${slug}`);

    return ok({
      instruction:
        "Adapt this template's calculated fields to the user's CSV. Compare USER_COLUMNS to the field names referenced in TEMPLATE_CONTEXT. Output: (a) a rename map {template_field -> user_column}, (b) any required field missing from the user CSV, (c) suggested calc adjustments per pitfalls_md.",
      template: {
        slug: data.slug,
        name: data.name,
        chart_type: data.chart_type,
        difficulty: data.difficulty,
        content_tier: data.content_tier,
        sample_csv_storage_path: data.sample_csv_storage_path,
      },
      user_columns: columns,
      template_context: {
        senior_take_md: data.senior_take_md,
        use_cases_md: data.use_cases_md,
        anti_patterns_md: data.anti_patterns_md,
        pitfalls_md: data.pitfalls_md,
        annotation_md: data.annotation_md,
      },
    });
  }
);

// -------------------------------------------------------------------------
// Wire up stdio transport.
// -------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
