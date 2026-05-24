# TableauKit MCP server

A Model Context Protocol server that exposes the TableauKit template gallery
to Claude Code, Cursor, and any other MCP-capable client.

## What it gives the model

| Tool             | What it returns                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `list_templates` | Compact list of published templates. Optional filters: `chart_type`, `difficulty`, `content_tier`.                        |
| `get_template`   | Full template row by `slug` — incl. `senior_take_md`, `use_cases_md`, `anti_patterns_md`, `pitfalls_md`, `annotation_md`. |
| `explain_xml`    | The line-by-line XML annotation for a flagship template (`content_tier = 1`).                                             |
| `adapt_to_csv`   | Template context + the user's CSV columns — the model uses this to suggest calc-field renames.                            |

## Install

```bash
cd mcp
npm install
```

## Config (env)

The server reads Supabase credentials from env. It also auto-loads
`<project root>/.env.local` and `<project root>/.env` if present, so the same
file the Astro site uses works here too.

| Variable                                            | Required | Notes                                                           |
| --------------------------------------------------- | -------- | --------------------------------------------------------------- |
| `PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)           | yes      | Supabase project URL.                                           |
| `PUBLIC_SUPABASE_ANON_KEY` (or `SUPABASE_ANON_KEY`) | yes      | Anon key. RLS allows public SELECT on published templates only. |

## Register with Claude Code

```bash
claude mcp add tableaukit node /absolute/path/to/tableaukit/mcp/server.mjs
```

Then in a Claude Code session:

```
> list_templates({ chart_type: "sankey" })
> get_template({ slug: "sankey-multi-level" })
> explain_xml({ slug: "sankey-multi-level" })
> adapt_to_csv({ slug: "dumbbell", columns: ["region","metric_a","metric_b"] })
```

## Notes

- The server uses the **anon** key. RLS in `tk_templates` only allows reading
  rows where `is_published = true`, so the MCP can never leak draft content.
- The process is standalone (its own `package.json`, its own `node_modules`),
  intentionally separate from the Astro app.
