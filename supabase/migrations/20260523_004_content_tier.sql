-- Add content_tier for the 3-tier mass-templates strategy.
-- Tier 1 = flagship (full annotation + 4 markdown sections).
-- Tier 2 = deep (3 sections — use_cases + anti_patterns + senior_take).
-- Tier 3 = quick reference (senior_take prose only).
--
-- Plus a composite index for the gallery filter UI
-- (chart_type dropdown + difficulty chips + tier badges).

alter table tk_templates
  add column if not exists content_tier int not null default 3
  check (content_tier in (1, 2, 3));

comment on column tk_templates.content_tier is '1 = flagship (full annotation + 4 markdown sections); 2 = deep (3 sections, no XML annotation, no pitfalls); 3 = quick reference (senior take prose only).';

create index if not exists tk_templates_filter_idx
  on tk_templates (chart_type, difficulty, content_tier, is_published);

-- Backfill: the 4 Phase 1 templates are all flagship.
update tk_templates set content_tier = 1
where slug in ('sankey-multi-level','dumbbell','bullet','hex-tile-map');
