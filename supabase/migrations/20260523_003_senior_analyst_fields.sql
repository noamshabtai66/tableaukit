-- Add senior-analyst content fields. These are the moat of TableauKit —
-- not just XML annotation, but the wisdom around when (and when NOT) to
-- use each chart type, plus tactical pitfalls.

alter table tk_templates
  add column if not exists use_cases_md text,
  add column if not exists anti_patterns_md text,
  add column if not exists senior_take_md text,
  add column if not exists pitfalls_md text;

comment on column tk_templates.use_cases_md is 'Markdown: bulleted list of when to reach for this chart. The positive case.';
comment on column tk_templates.anti_patterns_md is 'Markdown: bulleted list of when NOT to use, and what to use instead. The negative case + alternatives.';
comment on column tk_templates.senior_take_md is 'Markdown prose: the senior analyst perspective. Wisdom, context, what a junior would miss. THIS is the moat.';
comment on column tk_templates.pitfalls_md is 'Markdown: bulleted list of tactical mistakes / gotchas when building. Data shape, parameter tuning, performance, etc.';
