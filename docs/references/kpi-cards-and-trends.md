# KPI Cards, Trend Indicators, and Navigation Patterns

Authoritative reference for **BAN** (Big Ass Number) KPI cards, period comparisons, sparklines, shape-based trend indicators, map-layer KPI sheets, and dashboard navigation sidebars. Consolidates patterns from Flerlage Twins, Tableau Public dashboards, shape/trend encoding, and Mastering Tableau map layers.

**Cross-references**

- [calculated-fields-and-lod.md](calculated-fields-and-lod.md) — calculated field XML generation and LOD patterns
- [programmatic-twb-learnings.md](programmatic-twb-learnings.md) §13.22 — validated BAN with comparisons (vs prior period / vs last year)
- [dashboard-layout-and-zones.md](dashboard-layout-and-zones.md) — Dynamic Zone Visibility (DZV) drilldown and layout
- [error-codes-and-pitfalls.md](error-codes-and-pitfalls.md) — TWB error codes and fixes

---

## KPI Card Anatomy

- **BAN** always means a **KPI card with comparisons by default**: current value plus period-over-period context (e.g. % change, vs prior label), not a lone number.
- **Twin-worksheet pattern**: one worksheet for the BAN (text or invisible shape + `customized-label`), a second for the trend (line, area, or dual-axis sparkline), stacked in a vertical `layout-flow` container.
- **Default label stack (4 lines)**:
  1. Title (metric name) — small, muted
  2. Big number — large, bold
  3. vs prior period — split positive/negative fields or arrows + %
  4. Context line — e.g. “vs. [Parameter]” or “compared to last month to date”
- **Zone sizing**: **4-line** BAN → `fixed-size='110'`–`'120'`; **3-line** (title + value + change only) → `fixed-size='92'`.

---

## BAN Mark Types

### Text Mark (standard default)

- Use `<mark class='Text'/>` for BAN cards.
- Drive the card from **`customized-label`** with field references in separate `<run>` elements (each measure in its own `<run>`).
- This is the default approach for programmatic and hand-built KPI text cards.
- **CRITICAL:** The table-level `<style>` MUST include `<style-rule element="mark"><format attr="mark-labels-show" value="true"/>` — without this, the customized-label template loads but **does not render**. See [programmatic-twb-learnings.md](programmatic-twb-learnings.md) §12.2b.
- **Line breaks:** Use `Æ\n` (`&#xC6;&#10;`), NOT bare `\n`. Bare newlines are treated as whitespace. See §12.2c.
- **Font sizing:** Use 18pt for the primary value (22pt overflows cards narrower than ~200px), 9pt for labels, 10pt for secondary emphasis values.
- **Alignment:** `fontalignment='0'` (left) is recommended for BAN cards in grids to prevent overflow in narrow cards.
- **`fontname` on all runs:** Include `fontname` on every `<run>` element. Missing `fontname` can cause inconsistent fallback rendering.

### Shape Mark with Blank PNG (invisible-mark pattern)

- Use `<mark class='Shape'/>` with shape `':custom/Blank.png'` and very small size (e.g. `0.01`) when you want **only** the customized label visible with **no** text-mark artifact.
- **Scope**: special layouts that require Shape shelf behavior while keeping the visual as pure label typography.

**Summary:** **Text** is the default BAN mark type; **Shape + Blank.png** is for invisible-mark cases where labels alone should show.

---

## Split Positive / Negative Technique

Tableau cannot color one numeric field red and green by sign. Use **two calculated fields** so only one is non-null per row:

```tableau
-- Positive % (shows only when change is positive)
IF ([Current] - [Prior]) / [Prior] > 0
THEN ([Current] - [Prior]) / [Prior]
END

-- Negative % (shows only when change is negative)
IF ([Current] - [Prior]) / [Prior] < 0
THEN ([Current] - [Prior]) / [Prior]
END
```

- Place both on the label; format each with its own **`fontcolor`** in `customized-label` (e.g. positive **#1ea86c**, negative **#ca1325** — or brand grays/red as in source dashboards).
- Same idea for Flerlage-style table calcs:

```tableau
// Down — show only when negative
IF [3 Sales - % Difference] < 0 THEN [3 Sales - % Difference] ELSE NULL END

// Up — show only when positive or zero
IF [3 Sales - % Difference] >= 0 THEN [3 Sales - % Difference] ELSE NULL END
```

---

## Flerlage Twins Technique

**Source:** [How to Create a KPI Card (with Two Tricks for Showing % Change)](https://www.flerlagetwins.com/2025/09/how-to-create-kpi-card-with-two-tricks.html) — Kevin Flerlage, Sep 2025.

### Period bucket (CURRENT / PREVIOUS)

Bucket rows with **FIXED LOD** on max date (example: rolling 12 vs prior 12 months):

```tableau
// 1 Period
IF DATEDIFF('month', DATETRUNC('month', [Order Date]), { FIXED : MAX([Order Date]) }) <= 11
   THEN 'CURRENT'
ELSEIF DATEDIFF('month', DATETRUNC('month', [Order Date]), { FIXED : MAX([Order Date]) }) >= 12
  AND DATEDIFF('month', DATETRUNC('month', [Order Date]), { FIXED : MAX([Order Date]) }) <= 23
   THEN 'PREVIOUS'
ELSE 'NA'
END
```

Filter out `NA` as needed. Adjust bounds to exclude the partial current month if required.

### Previous value (table calculation)

```tableau
// 2 Sales - Previous Value
LOOKUP(ZN(SUM([Sales])), -1)
```

**Compute using:** Table (down) when Period is on Rows (PREVIOUS then CURRENT).

### Percent difference

```tableau
// 3 Sales - % Difference
(ZN(SUM([Sales])) - [2 Sales - Previous Value]) / ABS([2 Sales - Previous Value])
```

### Two presentation tricks

1. **Split calcs** for conditional color — separate “down” and “up” fields (see Split Positive/Negative).
2. **Custom number format with arrows:** `▲0%;▼0%;0%` (positive; negative; zero) — **▲** = ALT+30, **▼** = ALT+31.

### Table calc filter vs hide (keep % when only CURRENT shows)

If a dimension filter removes PREVIOUS **before** table calcs run, `LOOKUP(-1)` breaks.

**Option A — Table calculation filter (recommended):** e.g. `LOOKUP(MIN([1 Period]), 0)` on Filters, keep **CURRENT** only — runs after calcs.

**Option B — Hide:** leave both rows in the view, right-click PREVIOUS on Rows → **Hide**; PREVIOUS stays for calc order. Document with a caption if needed.

### Line chart companion

- Columns: Order Date (e.g. month); Rows: SUM(Sales); Color: Period (CURRENT vs PREVIOUS); exclude NA.

---

## Sparkline Companion Charts

### Superstore-style dual line (CY + PY)

- **Rows:** CY measure + PY measure (two lines on one chart).
- **Columns:** Order Date at month.
- **Mark:** Line; optional sparkline feel via tight vertical zone.
- **Layout-cache:** e.g. `minheight='120'`, `type-h='scalable'`.

CY/PY example calcs:

```tableau
DATE({ FIXED : MAX([Order Date]) })  -- Max Order Date

AVG(IF [Year] = YEAR([Max Order Date]) THEN [Fixed Order D Days] END)       -- CY
AVG(IF [Year] = YEAR([Max Order Date]) - 1 THEN [Fixed Order D Days] END)   -- PY
```

### Dual-axis line + area (same measure twice)

Place the **same measure twice** in rows with `+` and parentheses so Tableau builds a proper dual axis (see [programmatic-twb-learnings.md](programmatic-twb-learnings.md) §23k):

```xml
<rows>([ds].[usr:measure:qk] + [ds].[usr:measure:qk])</rows>
<cols>[ds].[tmn:Order Date:qk]</cols>
```

- **Synchronize:** `synchronized='true'` on the class `1` axis encoding — required or panes stack instead of overlaying.
- **Both Y-axes hidden**; gridlines, zerolines, and table dividers off where appropriate.
- **Area pane:** `mark-color='#dedede'` for light gray fill behind the line.
- **Zone:** `layout-cache` with `minheight='100'`, `type-h='scalable'` for the sparkline strip.

---

## Trend Indicators with Shapes

**Mark:** `<mark class='Shape'/>` in `<pane>`. Without a field on Shape, marks default to open circles; after 10 members, shapes cycle the default set.

### Built-in shape palettes

| Palette | Contents | KPI use |
|---------|----------|---------|
| **Default** | 20 geometric shapes | Categorical encoding |
| **Filled** | Solid circles, triangles, squares | ▲▼ style triangles |
| **Arrows** | Directional arrows | Direct trend |
| **KPI** | Checkmarks, X, warnings, traffic-style | Pass/fail |
| **Ratings** | Stars | Scores |
| **Weather** | Sun, cloud, etc. | Qualitative status |

Built-in XML names include: `circle`, `square`, `triangle`, `diamond`, `cross`, `plus`, `filled-circle`, `filled-square`, `filled-triangle`.

### Custom shape files

- **PNG** with transparent background (required for reliable color encoding).
- **32×32 px** standard (up to 64×64 for large marks); **under 50 KB** per file.
- Repository path: `My Tableau Repository/Shapes/{PaletteFolderName}/` — referenced in XML as `PaletteFolderName/filename.ext`.
- **Isolate** shapes into small folders: Tableau can Base64-embed an entire palette folder into the TWB, inflating file size if the folder is huge.

### TWB XML structure for shapes

**Encodings:**

```xml
<pane id='1'>
  <mark class='Shape'/>
  <encodings>
    <shape column='[datasource].[none:TrendIndicator:nk]'/>
    <color column='[datasource].[none:TrendColor:nk]'/>
  </encodings>
</pane>
```

**Style-rule mapping:**

```xml
<encoding attr='shape' field='[none:TrendIndicator:nk]' type='shape'>
  <map to='KPI Arrows/up_arrow.png'>
    <bucket>&quot;Up&quot;</bucket>
  </map>
  <map to='KPI Arrows/down_arrow.png'>
    <bucket>&quot;Down&quot;</bucket>
  </map>
  <map to='KPI Arrows/flat_arrow.png'>
    <bucket>&quot;Flat&quot;</bucket>
  </map>
</encoding>
```

Custom images appear as Base64 under `<shape name='...'>...</shape>`.

**Dual-axis overlay** — two `<pane>` elements (e.g. Bar + Shape): dual axis, synchronize, hide secondary axis header as needed.

### Calculated fields for trend classification

**Basic:**

```tableau
IF [Current Period Sales] > [Previous Period Sales] THEN "Up"
ELSEIF [Current Period Sales] < [Previous Period Sales] THEN "Down"
ELSE "Flat"
END
```

**Tolerance band:**

```tableau
IF [YoY Growth %] > 0.02 THEN "Up"
ELSEIF [YoY Growth %] < -0.02 THEN "Down"
ELSE "Flat"
END
```

**Null-safe:**

```tableau
IF ISNULL([YoY % Difference]) THEN ""
ELSEIF [YoY % Difference] > 0 THEN "▲"
ELSE "▼"
END
```

**FIXED LOD YoY (pattern):**

```tableau
{ FIXED : SUM(IF YEAR([Order Date]) = YEAR(TODAY()) - 1 THEN [Sales] END) }
{ FIXED : SUM(IF YEAR([Order Date]) = YEAR(TODAY()) THEN [Sales] END) }
```

---

## Dual Encoding: Shape + Color (WCAG 1.4.1)

- Place the **same** trend dimension on **both** **Shape** and **Color**.
- Do not rely on color alone or shape alone for trend meaning.
- Optional **decoupled** logic: one field for shape (“Up”/“Down”/“Flat”), another for severity on color (“Critical” vs “Negative”).

---

## Zero-Calc Number Format Alternative

Custom format on a single measure — arrows inline without separate trend calcs or shape marks:

```
▲+0.0%;▼-0.0%;0.0%
```

(positive; negative; zero)

---

## Map Layers + KPI in One Worksheet

From **Mastering Tableau 29 — Map layers KPI playground**: one worksheet can hold title, BAN, % change, tagline, and optional mini-chart using **map layers** and fixed positions instead of many dashboard zones.

### Manifest

```xml
<document-format-change-manifest>
  ...
  <Layers />
  ...
</document-format-change-manifest>
```

### Parameters

Lat/Lon parameters per element (Title, BAN, Change, Tagline, Dates, Graph). Values act as layout coordinates (e.g. shared Lon stacks vertically).

### Spatial calcs

```tableau
MAKEPOINT([Parameter Lat (Y)], [Parameter Lon (X)])
```

One spatial field per layer; use with **Collect** (or equivalent) so **Latitude (generated)** / **Longitude (generated)** drive the view.

### Worksheet structure

- `<mapsources>` with at least one `<mapsource name='' />`.
- Rows: Latitude (generated); Columns: Longitude (generated).
- `<panes customization-axis='layer'>` — each pane is a layer with `<lod>` = spatial calc, text/customized-label for content; `inert='true'` for non-interactive layers; invisible circle marks can use `mark-transparency='255'`.
- Hide map axes; optional `washout='0'` on map.

### Dashboard

- Single zone for the map-layers sheet; `show-title='false'` if the title lives inside the sheet.
- Reuse BAN logic from **Flerlage Twins** / split % fields for map-layer labels.

### Checklist

- [ ] `<Layers />` in manifest
- [ ] Lat/Lon parameters per layer
- [ ] One `MAKEPOINT` per layer
- [ ] Generated lat/lon on rows/cols; `customization-axis='layer'` panes
- [ ] Axes hidden; BAN % logic aligned with period calcs

---

## Navigation Sidebar Patterns

### Icon + text sidebar

Vertical `layout-flow`: bitmap icon zone + text label per item; `tabdoc:goto-sheet` for multi-dashboard navigation; optional toggle for contact/settings. Active text darker (`#333333`) vs inactive (`#898989`).

**Toggle button (pattern):**

```xml
<button action=''>
  <toggle-action>
    tabdoc:toggle-button-click-action
    window-id=&quot;{DASHBOARD_WINDOW_GUID}&quot;
    zone-id=&quot;BUTTON_ZONE_ID&quot;
    zone-ids=[TARGET_ZONE_ID]
  </toggle-action>
  <button-visual-state />
  <button-visual-state />
</button>
```

### Branded sidebar with decorative stripes

Sidebar column + parallel **empty** zones with stepped background colors (e.g. teal stripes `#062b2d` → `#3a6466`) for depth. Navigation may use **parameter actions** and zone visibility instead of `goto-sheet` for single-dashboard multi-view switching.

### Active indicator pattern (Global Software)

- Fixed-width sidebar (~240px); **5px** accent bar (`#6279b8`) on the active nav row; image buttons via `dashboard-object` + `goto-sheet`.
- Per-dashboard **info** buttons toggling help zones; export/image actions in a second group.

**Nav button XML (example):**

```xml
<zone type-v2='dashboard-object' ...>
  <button action='tabdoc:goto-sheet window-id=&quot;{...}&quot;'>
    <button-visual-state>
      <image-path>Image/overview.png</image-path>
    </button-visual-state>
  </button>
</zone>
```

### Dark header navigation (Help Desk)

- Full-width bar `~125px`, background `#3d475f`, title + **image PNG** nav (`goto-sheet`) + settings toggle (`Settings.png` / `Settings OFF.png`).

**DZV drilldown** for KPI grids (parameter “Open”, drill panel overlay): full XML patterns in [dashboard-layout-and-zones.md](dashboard-layout-and-zones.md) and [dynamic-zone-visibility-show-hide-buttons.md](dynamic-zone-visibility-show-hide-buttons.md) where present.

---

## Google Ads Pattern

- **Structure:** section title (text) → KPI worksheet → dedicated trend worksheet.
- **Label:** large KPI value; **split** green/red % lines via `SIGN()`; context line in small type; line break `Æ&#10;` where needed.
- **Shapes:** `SIGN([% Diff])` can drive **Arrows** palette shapes (e.g. `format attr='shape' value='Arrows/1-8.png'`).
- **Calcs (illustrative):**

```tableau
IF SIGN([% Diff]) = 1 THEN "+" + STR(ROUND([% Diff], 1)) + "%" ELSE "" END   -- positive string
IF SIGN([% Diff]) = -1 THEN STR(ROUND([% Diff], 1)) + "%" ELSE "" END          -- negative string
SIGN([% Diff])   -- direction for arrow shape
```

---

## Color Palettes

Six palette families from reference dashboards (abbreviated):

| Source | Notes |
|--------|--------|
| E-Commerce | `#1b1b1b` text, `#898989` muted, `#9a928f` / `#f4284e` for ±% |
| Superstore teal | `#052527`–`#3a6466` stripes, `#849ea0` dividers |
| Google Ads | `#3c8bd9` KPI, `#59a14f` / `#d1668f` ± |
| DZV indigo | `#4d60f3` values, `#dbdffd` borders |
| Global Software | `#6279b8` active nav, `#59a14f` / `#e15759` ± |
| Help Desk header | `#3d475f` bar, trend blues/teals/pinks |

**Status green / red (canonical KPI deltas):** **#1ea86c** / **#ca1325**.

---

## Number Formats

| Type | Examples |
|------|----------|
| Currency | `c"$"#,##0;-"$"#,##0`, `c"$"#,##0,K;("$"#,##0,K)` |
| Count | `n#,##0;-#,##0` |
| Percent | `p0%`, `*▲ 0.0%`, `*▼ 0.0%` |
| Days | `n#,##0" days";-#,##0" days"` |
| Inline arrows | `▲+0.0%;▼-0.0%;0.0%` |

Tableau prefix letters: `c` currency, `p` percent, `*` date; see [programmatic-twb-learnings.md](programmatic-twb-learnings.md) §23m for `text-format` in styles.

---

## Period Comparison Patterns

**Dynamic window (parameter days):**

```tableau
-- Current: last N days from max date (simplified)
DATEDIFF('day', [event_date], { FIXED : MAX([event_date]) }) < [Parameter N]
-- Prior: mirror window N..2N
```

**YoY (Superstore-style):**

```tableau
SUM(IF [Year] = YEAR([Max Order Date]) THEN [Sales] END)
SUM(IF [Year] = YEAR([Max Order Date]) - 1 THEN [Sales] END)
(SUM([CY]) - SUM([PY])) / SUM([PY])
```

**vs Previous Month / vs Last Year:** implement with parameters or FIXED LOD max date; align BAN and sparkline filters.

---

## Arrow Field XML (`User` / `usr:`)

For aggregate string calcs driving arrows or labels in TWB XML, use **`derivation='User'`** and **`[usr:...:qk]`** (or the appropriate role) in column-instances, encodings, and `customized-label` — not `[none:...:nk]` when the field is a user calc. **Each field** in a `customized-label` should be its **own** `<run>`. See [programmatic-twb-learnings.md](programmatic-twb-learnings.md) §12–§13.22.

---

## Implementation Checklist

### KPI / BAN

- [ ] CY/PY or CURRENT/PREVIOUS calcs; filter NA where used
- [ ] Previous value: `LOOKUP(ZN(SUM([Measure])), -1)` with correct compute order, or equivalent
- [ ] % difference; optional split up/down for color
- [ ] Table calc filter or hide row so only current period shows without losing %
- [ ] BAN: Text mark default, or Shape + Blank.png for invisible mark
- [ ] **`mark-labels-show="true"`** style rule in table-level `<style>` (§12.2b — without this, customized-label loads but does NOT render)
- [ ] `customized-label` runs; transparent table; axes off; dashboard `show-title='false'` on BAN zones when title is in the label
- [ ] Line breaks use **`Æ\n`** (`&#xC6;&#10;`), NOT bare `\n` (§12.2c)
- [ ] **`fontname`** on every `<run>` element in customized-label (§12.2e)
- [ ] Primary value ≤ 18pt (22pt overflows narrow cards); labels 9pt (§12.2e)
- [ ] Trend sheet: line, dual line, or dual-axis line+area per §Sparkline Companion Charts
- [ ] Arrow / string calcs: `User` derivation in XML when applicable

### Shapes

- [ ] Trend field on **both** Shape and Color
- [ ] Custom shapes in lean folders; 32×32 PNG, under 50 KB each
- [ ] `encoding attr='shape'` maps with `PaletteFolderName/file.png`

### Navigation

- [ ] Sidebar or header: `layout-flow`, icons + text or image buttons
- [ ] `goto-sheet` or parameter-driven visibility per design
- [ ] Info/toggle zones wired with `toggle-button-click-action` where needed

### Dashboard scope

- **Sheets per dashboard:** **2–4** typical; **up to 5** for KPI-heavy layouts.

### DZV / layout

- [ ] Drilldown overlays: boolean + parameter actions; manifest entries for zone visibility — details in [dashboard-layout-and-zones.md](dashboard-layout-and-zones.md)

---

## References

- Flerlage Twins: [How to Create a KPI Card (with Two Tricks for Showing % Change)](https://www.flerlagetwins.com/2025/09/how-to-create-kpi-card-with-two-tricks.html)
- Mastering Tableau 29: Map layers KPI playground (Tableau Public)
- Tableau Public dashboards cited in source notes: E-Commerce (Victory Omovrah), Superstore Shipping (John Johansson), Google Ads Performance, Global Software Retail Analytics, Dynamic Zone KPIs, Help Desk #RWFD
