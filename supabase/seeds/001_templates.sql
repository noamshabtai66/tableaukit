-- TableauKit seed templates — 4 embedded Tableau Public viz with senior-analyst content.
-- Pattern: link out to Tableau Public (no .twbx hosted here), author credit + license note,
-- plus our own use_cases / anti_patterns / senior_take / pitfalls.
--
-- To reproduce: run after migrations 001-003 are applied.

INSERT INTO tk_templates (
  slug, name, subtitle, chart_type, difficulty, build_time_min,
  tableau_public_url, twbx_storage_path, annotation_md, tags,
  author_name, author_profile_url, license_note,
  use_cases_md, anti_patterns_md, senior_take_md, pitfalls_md,
  is_published, published_at
) VALUES
-- ============================================================================
-- 1. Multi-Level Sankey (Ken Flerlage)
-- ============================================================================
(
  'sankey-multi-level',
  'Multi-Level Sankey',
  'Flow visualization across 2-5 sequential category levels',
  'sankey',
  'advanced',
  45,
  'https://public.tableau.com/views/Multi-LevelSankeyTemplate/Sankey',
  null,
  E'## What this chart does\n\nA **Sankey diagram** shows how a quantity flows through a series of sequential category levels — for example, customer journey stages, budget allocation by department, or energy production by source. The width of each ribbon is proportional to the size of the flow it represents.\n\nThis template supports **2–5 levels** with a parameter to control whitespace between bars.\n\n## High-level architecture\n\nThe sankey uses **two datasources stitched together**:\n\n1. `Parameters` — single-row datasource holding a `Whitespace` parameter (0.0 to 0.3) that controls the gap between bars.\n2. `Sankey` — the actual data, with each row representing one step in the flow. The template uses an Excel datasource densified with a `Link` field and a `t` (model) field to give the polygon enough density (96 points per ribbon).\n\nThe trick: each ribbon is rendered as a polygon with ~96 points. The polygon''s vertical position at each point is calculated from a **sigmoid curve** — that''s what makes the smooth S-shaped ribbons instead of straight lines.\n\n## The 5 calculations that matter most\n\n### `Sigmoid`\n```\n1 / (1 + EXP(1)^-[t (Model)])\n```\nThe classic sigmoid function. `t` ranges from -6 to +6 across the 96 points. Produces an S-curve from 0 to 1.\n\n### `N1 Flow Size`\n```\n(SUM([Size]) * (1 - SIZE() * [N1 Whitespace])) / TOTAL(SUM([Size]))\n```\nEach ribbon''s thickness, normalized so all flows on Level 1 sum to 1.0.\n\n### `N1 Position`\n```\nRUNNING_SUM([N1 Flow Size]) - [N1 Flow Size] + [N1 Index] * [N1 Whitespace] - [N1 Whitespace]/2\n```\nVertical center of each ribbon on Level 1. `RUNNING_SUM` stacks ribbons top-to-bottom.\n\n### `Curve 1-2 Polygon`\n```\nCASE ATTR([Min or Max])\n  WHEN ''Min'' THEN [Curve 1-2 Min]\n  WHEN ''Max'' THEN [Curve 1-2 Max]\nEND\n```\nFor each of the 96 polygon points, returns the top or bottom edge of the ribbon.\n\n### `N1 Whitespace`\n```\n[Parameters].[Parameter 1 1] / SIZE()\n```\nDivides the user''s Whitespace parameter equally across all bars.',
  ARRAY['flow','journey','polygon','advanced-math','flerlage'],
  'Ken Flerlage',
  'https://public.tableau.com/app/profile/ken.flerlage',
  'Embedded from Tableau Public. All rights to the original author. Annotation by TableauKit.',
  E'- **Customer journey funnels** — Lead → MQL → SQL → Closed-won. Shows both conversion *and* paths.\n- **Budget flow** — Revenue → Department → Cost center → Margin.\n- **Employee tenure flow** — Hired in year X → tenure brackets → still active vs. left.\n- **Marketing attribution** — Channel → Campaign → Conversion.\n- **Energy / material flow** — The original use case. Inputs split into outputs.',
  E'- **Only 2 dimensions?** Use a **stacked bar**. Sankey adds complexity without adding clarity at 2 levels.\n- **Audience needs exact numbers** → Use a **table** or rich tooltips. Sankey is for *shape*, not for reading numbers.\n- **Comparing absolute quantities** across categories → **Grouped bar** beats Sankey.\n- **Showing change over time** → This is a flow chart, not a time-series. Use a **line chart**.\n- **More than 5 levels** → Visual noise. Consolidate stages.\n- **Small dataset (under 30 rows)** → A **dumbbell** or **ladder chart** tells the story faster.',
  E'Most analysts reach for Sankey to *show off* — it''s visually impressive and stakeholders remember it. Here''s the trap: a Sankey is a **flow** chart, not a **comparison** chart.\n\nIf your audience needs to compare quantities (which is what 80% of business questions require), you''re probably better off with a stacked bar. Use Sankey when **the path matters as much as the total** — customer journey funnels are the textbook case: people care that 60% of trials convert to paid, but they care equally about *which path they took*.\n\nThe unspoken rule: a good Sankey makes the reader instantly see *one specific surprise* — the unexpected leak, the dominant path, the dead-end stage. If your Sankey shows "data" but not "story," cut it and use a bar chart.\n\nOn Ken Flerlage''s technique specifically — it''s brilliant but heavy (15+ calculated fields, polygon math). For your first Sankey, use it. For your tenth, write your own simpler version — most use cases need only 2-3 levels.',
  E'- **Data shape mistake** — You need one row *per flow segment* (Customer→Stage1, then Customer→Stage2 if they moved). Many analysts try one row per customer.\n- **Whitespace parameter too high** — At 0.3+, ribbons get too thin. The template default (0.14) is good.\n- **Sort order surprises** — Ribbons sort by data load order by default. Add an explicit "Sort" column.\n- **Performance cliff at ~10k rows** — Polygon densification makes this sluggish on big data.\n- **Z-fighting on overlapping ribbons** — Two crossing ribbons render with flickering. Split into multiple Sankeys or sort to minimize crossings.\n- **Missing data shows as gaps** — Null values in any level field break the flow. Add a "Not specified" category.',
  true,
  now()
),
-- ============================================================================
-- 2. Dumbbell Chart
-- ============================================================================
(
  'dumbbell',
  'Dumbbell Chart',
  'Before / after comparison with the gap as the story',
  'dumbbell',
  'intermediate',
  15,
  'https://public.tableau.com/views/HowtoMakeDumbbellCharts/Dumbbell',
  null,
  E'## Structure\n\nA dumbbell is a **dual-axis chart** with three mark types: two circles (one per measure) sharing an axis, plus a connecting line drawn via Measure Names → Path.\n\n## The three marks\n\n1. **Circle 1** — first measure (e.g. `Sales_2025`), mark type = Circle, size ~12-18.\n2. **Circle 2** — second measure (e.g. `Sales_2026`), same axis (Dual Axis + Synchronize), different color.\n3. **Line** — third axis with `Measure Values` on Columns, mark type = Line, `Measure Names` dragged to Path.\n\n## The non-obvious step\n\nThe connecting line is **not** automatic. Tableau doesn''t know that the two circles belong together until you give it `Measure Names` as Path on the line marks card. This is the step every dumbbell tutorial under-explains.',
  ARRAY['comparison','before-after','dual-axis','intermediate'],
  'Tableau Public community',
  'https://public.tableau.com/app/discover',
  'Embedded from Tableau Public. Use the View source link to find the original author. Annotation by TableauKit.',
  E'- **Before / after** — ratings before vs after a product change, customer satisfaction last quarter vs this quarter\n- **This year vs last** — sales by region 2025 → 2026\n- **Actual vs target** — when the target is a single number per category (use bullet for *range* targets)\n- **Forecast vs actual** — planned vs realized\n- **Two snapshots in time** — anywhere you have exactly two scalar values per category',
  E'- **More than 2 points per category** → use a **grouped bar**. Dumbbells with 3 dots become noise.\n- **Single value per category** → just use a **bar chart**.\n- **Continuous time series** (12 months) → use a **line chart**, not 12 dumbbells stacked.\n- **Audience needs all values stacked** → use a **stacked bar** or **slope chart**.\n- **Same value for both points** (no change) → category looks weird. Filter those rows out, or annotate.',
  E'A dumbbell is the prettiest before/after chart in Tableau, and that''s both its strength and its trap. People reach for it because it looks "designerly" — then they use it for data where the gap isn''t actually the story.\n\nUse a dumbbell when **three things are true**: (a) you have exactly two points per category, (b) the *gap* (or direction of change) is the insight you want to highlight, and (c) you want both endpoints visible — not just the change itself.\n\nIf only (a) is true, use a bar chart with two colors. If (a) and (b) hold but you don''t need to see endpoints, use a slope chart. Dumbbell is for when *all three* are true.\n\nDumbbells whisper — they don''t shout. Use them when the *direction of change* matters per row, not when comparing magnitudes across rows. For magnitude comparison, paired bars are clearer.',
  E'- **The connecting line trick** — Tableau doesn''t draw the line between dots natively. You need a third marks tab with mark type = Line, and `Measure Names` dragged to Path.\n- **Synchronized axes** — both circle measures must share the same axis (Dual Axis + Synchronize).\n- **Color encoding the change direction** — coloring the connecting line by "did it go up or down" is the highest-leverage polish: `IF [Value_2] > [Value_1] THEN "Up" ELSE "Down" END`.\n- **Sort order matters** — sort categories by the value you care about most (usually the latest), descending.\n- **Mark size** — Tableau''s default ~6pt circles are too small. Bump to 12-18 so the dots read clearly.',
  true,
  now()
),
-- ============================================================================
-- 3. Bullet Chart
-- ============================================================================
(
  'bullet',
  'Bullet Chart',
  'Actual vs target with qualitative performance ranges',
  'bullet',
  'intermediate',
  20,
  'https://public.tableau.com/views/AlternativeBulletChartExample/AlternativeBulletChart',
  null,
  E'## Structure\n\nA bullet chart combines **three visual elements** into one row:\n\n1. **A horizontal bar** — the current/actual value\n2. **A vertical marker line** — the target\n3. **Grayscale background bands** — qualitative ranges (poor / satisfactory / good)\n\n## Tableau implementation\n\n- The **bar** is a normal SUM(actual) on Columns with mark type = Bar.\n- The **target** uses **dual axis** with mark type = Gantt (a thin vertical line at the target value).\n- The **bands** use Tableau''s built-in **Distribution Reference Lines** (Analytics pane → Distribution).\n\nIt''s a dual-axis with reference lines — no exotic XML, no calc magic. The skill is in the layout and color choices, not the technique.',
  ARRAY['kpi','target','dashboard','stephen-few'],
  'Clearly and Simply (Robert Mundigl)',
  'https://www.clearlyandsimply.com/',
  'Embedded from Tableau Public. Original technique by Stephen Few (2005); this implementation by Clearly and Simply. Annotation by TableauKit.',
  E'- **KPI dashboards** — actual revenue vs target with poor/satisfactory/good zones\n- **Performance reviews** — score against role expectations (band 1/2/3)\n- **OKR tracking** — current progress vs quarterly goal with confidence bands\n- **SLA monitoring** — response time vs target with acceptable/warning/critical zones\n- **Anywhere "actual vs target"** needs qualitative context, not just a delta number',
  E'- **No clear target** → just use a **bar chart**.\n- **Many KPIs (>10)** → use a **bullet small-multiple grid**, not a single tall column.\n- **Audience unfamiliar with the format** → educate first, or fall back to a labeled bar.\n- **Continuous data over time** → bullet is a snapshot. For trend use **line + reference band**.\n- **Multi-dimensional comparison** (2x2) → bullet is single-KPI. Use a different chart entirely.',
  E'Stephen Few designed bullets in 2005 to replace gauges and pie charts on dashboards. Twenty years later they''re still underused — not because they''re inferior, but because most analysts reach for "what looks familiar" (gauges, donuts) instead of "what communicates fastest" (bullet).\n\nA great bullet is **boring on purpose**. The bar is the actual value. The target is a single vertical line. The qualitative bands are subtle grayscale rectangles. There''s no decoration. The reader''s eye lands on "did we hit the target?" in 1 second.\n\nWhere it goes wrong: 5 qualitative bands when 3 would do; rainbow colors that pull attention away from the comparison; horizontal orientation when the dashboard begs for vertical (bullets go both ways, but commit to one).\n\nWhen stakeholders push back ("but it doesn''t pop!") the answer isn''t visual flourish — it''s using *more* bullets per dashboard. The shape becomes a vocabulary at scale.',
  E'- **Dual-axis for the target line** — the target is its own measure (Gantt mark type, or a reference line).\n- **Reference distribution for bands** — Tableau has built-in **Distribution Reference Lines**. Use them; don''t draw bands manually.\n- **Band widths must reflect data** — equal-width bands (33/33/33) is a visual lie. Set widths to match what those labels mean.\n- **Sort order** — sort by *gap from target*, not by absolute value. "Furthest behind" is what the dashboard owner cares about.\n- **Color the bar when it crosses target** — small change with big payoff for scannability.\n- **Avoid color in the bands** — grayscale only. Color the *bar* if you want emphasis.',
  true,
  now()
),
-- ============================================================================
-- 4. Hex Tile Map
-- ============================================================================
(
  'hex-tile-map',
  'Hex Tile Map',
  'Equal-weight geographic map that solves the "Alaska effect"',
  'hex-map',
  'intermediate',
  25,
  'https://public.tableau.com/views/EuropeHexagonTileMap/EuropeHexmap',
  null,
  E'## Structure\n\nA hex tile map is **not really a map** — it''s a scatter plot where each region (state, country) is placed on a precomputed (X, Y) coordinate grid, then rendered with a hexagonal shape.\n\n## The four ingredients\n\n1. **Region coordinate table** — a CSV with `Region, X, Y` columns. For US states, use Matt Chambers''s standard layout.\n2. **Hexagon shape file** — a custom Tableau shape (.png) of a single hexagon, placed in `My Tableau Repository/Shapes/`.\n3. **Your data** — joined to the coordinate table on `Region`.\n4. **Mark type = Shape** — assigned to the hex shape, sized large enough to tile.\n\nThat''s it. No spatial functions, no geo lookups, no `MAKEPOINT()`.',
  ARRAY['map','geographic','equal-weight','political'],
  'Tableau Public community (based on Matt Chambers''s technique)',
  'https://public.tableau.com/app/profile/matt.chambers',
  'Embedded from Tableau Public. Technique pioneered by Matt Chambers (sirvizalot.com). Annotation by TableauKit.',
  E'- **US elections / political data** — avoid the "Alaska effect" where huge empty states dominate visually\n- **State-level KPIs** — sales/customers/users where what matters is *which states*, not geographic accuracy\n- **Mobile-friendly maps** — hex tiles render cleanly at small sizes\n- **European data with equal weight per country** — populations vary massively but each country deserves equal visual prominence\n- **Anywhere "small dense region gets lost" is a real problem**',
  E'- **Geographic precision matters** → use a **real map**. Hex tile distorts proximity.\n- **Sub-state data** (counties, ZIPs, cities) → use a **real map** or **choropleth**.\n- **Audience expects "this looks like a map"** → add a small inset showing the abstract → geographic mapping.\n- **Cross-border adjacency matters** → hex breaks real adjacency. Use real geo.\n- **You don''t have the coordinate table** → don''t roll your own. Find the community-blessed one.',
  E'A hex tile map solves *one* specific problem: the "Alaska effect" — large, sparsely populated regions dominate visual weight while small dense regions disappear. NJ has more people than the entire Rocky Mountain region, but on a real map it''s a sliver. On a hex tile, NJ is the same size as Wyoming.\n\nThat''s the only problem hex tiles solve well. They sacrifice geographic accuracy entirely — proximity, shape, area, all approximations. For political analysis (elections, demographics, policy), this tradeoff usually wins. For "where are our customers physically located?", a real map almost always wins.\n\nThe unspoken rule: a hex tile map should look *obviously not like* a real map. Don''t try to make it "almost geographic" — that''s the worst of both worlds. Commit to the abstract layout, label each hex with the state/country abbreviation, and let the equal-weight property do the work.\n\nWhen stakeholders ask "why doesn''t this look like the map from the news?" — the answer is that this is a *better* map for the comparison being made. Educate; don''t apologize.',
  E'- **Use Matt Chambers''s standard coordinate data** — don''t roll your own. There''s a community-blessed table of US state coordinates.\n- **Shape file must match coordinate grid** — the hex shape''s size and the X/Y spacing must line up.\n- **Labels need abbreviations** — at small hex sizes "NEW HAMPSHIRE" won''t fit. Use NH.\n- **Decide upfront on Alaska / Hawaii placement** — hex tile maps usually pull them into the bottom-left corner.\n- **Two-color diverging scale beats heat maps** — for political data, red/blue is more legible than continuous gradient.\n- **Color the border, not just the fill** — a thin (1-2px) white border between hexes makes each one distinct.',
  true,
  now()
);
