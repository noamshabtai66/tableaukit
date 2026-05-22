# Calculated Fields, LOD, and Dashboard Patterns

**Authoritative reference for calculated fields in TWB XML** (Tableau 2023+, schema 18.1). Use when emitting or editing TWB XML programmatically.

For full error codes and load failures, see [error-codes-and-pitfalls.md](error-codes-and-pitfalls.md). For Tableau function syntax, see [tableau-functions-reference.md](tableau-functions-reference.md).

---

## Where Calculated Fields Live

Calculated fields appear in **different shapes** depending on datasource type.

### Pattern A: Top-level `<column>` (federated / direct)

For direct database connections and **federated** datasources, formulas live in `<column>` elements with a nested `<calculation>`, placed **after** `<aliases enabled='yes' />`:

```xml
<datasource inline='true' name='federated.XXXXX'>
  <connection class='federated'>...</connection>
  <aliases enabled='yes' />
  <!-- Calculated fields here -->
  <column caption='Profit Ratio' datatype='real'
          name='[Calculation_5571209093911105]' role='measure' type='quantitative'>
    <calculation class='tableau' formula='SUM([Profit])/SUM([Sales])' />
  </column>
</datasource>
```

### Pattern B: `<connection><calculations>` (sqlproxy / published)

For **published datasource** connections (`sqlproxy`), formulas also live inside `<connection>` under a `<calculations>` wrapper. Each entry is a flat `<calculation>` with `column` and `formula` attributes:

```xml
<datasource caption='Revenue view (Databricks)' inline='true' name='sqlproxy.XXXXX'>
  <connection class='sqlproxy' ...>
    <relation type='collection'>
      <relation name='sqlproxy' table='[sqlproxy]' type='table' />
    </relation>
    <calculations>
      <calculation column='[Gross Collection (copy)_14636757085798420]'
                   formula='SUM(&#10;    IF [order_status] = &quot;COMPLETED&quot;&#10;    THEN [usd_net_total]&#10;    END&#10;)' />
    </calculations>
    <metadata-records>...</metadata-records>
  </connection>
  <!-- ALSO: top-level <column> for the same fields -->
  <column aggregation='User' caption='Net Revenue' datatype='real'
          name='[Gross Collection (copy)_14636757085798420]'
          role='measure' type='quantitative'>
    <calculation class='tableau' formula='SUM(&#10;    IF [order_status] = &quot;COMPLETED&quot;&#10;    THEN [usd_net_total]&#10;    END&#10;)' />
  </column>
</datasource>
```

**Sqlproxy:** the formula typically appears in (1) `<connection><calculations>`, (2) top-level `<column><calculation>`, and (3) `<metadata-records>` formula attributes.

### Other locations

- **Table calculation addressing** (compute-using): in the **worksheet** `<datasource-dependencies>` → `<column-instance>` with `<table-calc>`. The formula stays in the datasource; only ordering/partitioning lives in the sheet.
- **Parameters**: separate datasource `hasconnection='false'`, `name='Parameters'`. Reference in formulas as `[Parameters].[Parameter Name]`.

---

## Minimal Column Pattern

For **user-style** calculated fields (Desktop-recognizable calcs), use the **minimal** “Test” `<column>` form:

| Attribute | Required | Values / notes |
|-----------|----------|----------------|
| `name` | Yes | `[Calculation_XXXXXXXXXXXXXXXXXXX]` — bracket-enclosed, unique |
| `caption` | Yes | Display name in Data pane |
| `datatype` | Yes | `string`, `integer`, `real`, `boolean`, `date`, `datetime` |
| `role` | Yes | `dimension` or `measure` |
| `type` | Yes | `nominal`, `ordinal`, or `quantitative` |

**Omit** on the column for this pattern: `aggregation`, `default-type`, `layered`, `pivot`, `user-datatype`, `visual-totals` (optional elsewhere; minimal set matches Tableau’s stored “Test” format).

### Role and type combinations

| role | type | Use |
|------|------|-----|
| `measure` | `quantitative` | Aggregated measures (SUM, ratios) |
| `dimension` | `nominal` | String/category dimensions, boolean flags |
| `dimension` | `ordinal` | Discrete dates, numeric dimensions |
| `dimension` | `quantitative` | Continuous date axes |

### The `<calculation>` child

Every calc **must** have a `<calculation>` child with a non-empty `formula`. A **self-closing `<column />` with no `<calculation>`** (or no formula) causes Tableau to treat the field as missing (“field doesn’t exist”).

```xml
<calculation class='tableau' formula='...' scope-isolation='false' />
```

- **`class`** — Always `'tableau'` for native calculations.
- **`formula`** — Expression; must be XML-encoded (see below).
- **`scope-isolation`** — See [LOD Expressions](#lod-expressions).

---

## XML Encoding for Formulas

Formulas live in XML attributes; use **one** canonical encoding scheme:

| Character | Entity | Example in formula |
|-----------|--------|--------------------|
| `"` | `&quot;` | `&quot;East&quot;` |
| `<` | `&lt;` | `[Sales] &lt; 100` |
| `>` | `&gt;` | `[Sales] &gt; 100` |
| `'` | `&apos;` | `DATEADD(&apos;day&apos;, -1, TODAY())` |
| `&` | `&amp;` | `[A] &amp; [B]` |
| Newline (LF) | `&#10;` | Multiline `IF` / `CASE` bodies |

**Also:** `&#13;&#10;` (CR+LF) is valid if the workbook uses Windows-style line breaks in attributes.

**Does not need encoding:** `{` `}` for LOD; `#2024-01-01#` date literals; field refs `[Field Name]`.

**Rule:** Set formula values with an **XML library** (e.g. Python `ElementTree` / `lxml`); do not concatenate raw attribute strings by hand.

---

## Field References and Column-Instance Naming

### Formula references

- **Same datasource:** `[Sales]`, `[Profit]`, `[Calculation_591167832808235012]`.
- **Parameters:** `[Parameters].[Start date]`, `[Parameters].[Date filter Param]`.
- **Cross-datasource (blending):** `[federated.xxx].[Target]`.

References are **case-sensitive** and must match the column `name` exactly (including brackets).

### Column-instance naming (worksheet / shelves)

Fully qualified shelf references use:

`[DatasourceName].[derivation:FieldName:suffix]`

| Prefix / pattern | Meaning |
|------------------|---------|
| `none:` | No aggregation (dimensions, row-level discrete calcs) |
| `sum:`, `avg:`, … | Aggregated base fields |
| `usr:` | User-defined aggregation on calculated fields (measures) |
| `tmn:`, `yr:`, `qr:`, `dy:`, … | Date parts / truncations |

| Suffix | Meaning |
|--------|---------|
| `:nk` | Nominal (discrete) |
| `:ok` | Ordinal |
| `:qk` | Quantitative (continuous) |

Example: `[federated.abc123].[none:Category:nk]`, `[federated.abc123].[usr:Calculation_123:qk]`.

---

## Derivation Rules

These apply to **`<column-instance>`** in worksheets (derivation is **not** valid on datasource `<column>` — see [error-codes-and-pitfalls.md](error-codes-and-pitfalls.md)).

| Concept | `derivation` attribute | Name prefix | Typical use |
|---------|------------------------|-------------|---------------|
| **Dimension** (row-level) | `None` | `none:` | `DATETRUNC`, `CASE` switchers, boolean filters, discrete string calcs |
| **Measure** (aggregated) | `User` | `usr:` | `SUM`, `COUNTD`, ratios, aggregated calcs |

**Aggregate string measures** (e.g. `datatype='string'` with `SUM`/`COUNTD` in the formula, or arrow symbols as measures): use **`derivation="User"`** and **`usr:`** on the column-instance, not `none:`.

**Arrow / symbol calcs** used as measures on Text: **`usr:`**, not `none:`.

**`DATETRUNC`** returns a **datetime** in many contexts — use **`datatype="datetime"`** on the `<column>` when Tableau types the result as datetime, even if the source field is `date`.

---

## Parameters in Calcs

Reference parameters as `[Parameters].[Parameter Name]`.

### Range vs list (mutually exclusive)

- **List parameters:** `<members>` with `<member value='...' />` only.
- **Range parameters:** `<range min='...' max='...' />` only (optional `granularity` for numeric).

Do not mix `<members>` and `<range>` on the same parameter column.

### Date range parameters

Use **only** `min` and `max` on `<range>`. **Do not** add `period` (e.g. `period='day'`) — not in schema; causes load error **D2E8DA72** (see [error-codes-and-pitfalls.md](error-codes-and-pitfalls.md)).

```xml
<column caption='Start Date' datatype='date' name='[Parameter 5]'
        param-domain-type='range' role='dimension' type='ordinal' value='#2024-01-01#'>
  <calculation class='tableau' formula='#2024-01-01#' />
  <range max='#2026-12-31#' min='#2020-01-01#' />
</column>
```

**Numeric range:** `<range min='...' max='...' granularity='...' />`.

List members for strings use `&quot;` inside `value`, e.g. `<member value='&quot;East&quot;' />`.

---

## Table Calculations

- **Formula** (e.g. `LOOKUP(..., -1)`, `RUNNING_SUM(...)`) is defined in the **datasource** `<column>` → `<calculation>`.
- **Configuration:** nest `<table-calc ordering-type='Rows' />` **inside** the datasource `<calculation>`, and mirror it on the **worksheet** `<column-instance>`.

```xml
<!-- Datasource -->
<column caption='Previous Value' datatype='real' name='[Net Collection Previous Value_20250606]' role='measure' type='quantitative'>
  <calculation class='tableau' formula='LOOKUP(ZN([Gross Collection (copy)_14636757085798420]), -1)'>
    <table-calc ordering-type='Rows' />
  </calculation>
</column>

<!-- Worksheet datasource-dependencies: minimal column + column-instance -->
<column caption='Previous Value' datatype='real' name='[Net Collection Previous Value_20250606]' role='measure' type='quantitative' />
<column-instance column='[Net Collection Previous Value_20250606]' derivation='User' name='[usr:Net Collection Previous Value_20250606:qk]' pivot='key' type='quantitative'>
  <table-calc ordering-type='Rows' />
</column-instance>
```

| `ordering-type` | Meaning |
|-----------------|--------|
| `Rows` | Compute by rows |
| `Columns` | Compute by columns |
| `Field` | Compute using specific field(s) |
| `Table` | Table (across/down) |

---

## LOD Expressions

### Syntax

`{ FIXED | INCLUDE | EXCLUDE <dimensions> : <aggregate expression> }`

- **FIXED** — Computed at specified level; by default **before** dimension filters (unless promoted to context). Omitting dimensions: `{ FIXED : SUM([Sales]) }` is a grand total.
- **INCLUDE** — Adds granularity; interacts with filters in the usual INCLUDE order.
- **EXCLUDE** — Removes dimensions from the level of detail.

### `scope-isolation` (canonical)

- Set **`scope-isolation='false'`** on `<calculation>` when a **FIXED** LOD should **respect data source filters** (common for “max date in filtered range,” cohort calcs, cross-datasource-safe patterns).
- **Omitting** `scope-isolation` uses default behavior: **FIXED** LOD **ignores** normal dimension filters unless they are context filters.

Filter order reminder: FIXED runs before dimension filters; INCLUDE/EXCLUDE after. Promote filters to context when FIXED must respect them.

### Examples in XML

**FIXED customer first date**

```xml
<column caption='Customer First Purchase' datatype='date'
        name='[Calculation_1234567890123456789]' role='dimension' type='ordinal'>
  <calculation class='tableau'
    formula='{FIXED [Customer ID] : MIN([Order Date])}' />
</column>
```

**Cohort month**

```xml
<calculation class='tableau'
  formula='DATETRUNC(&quot;month&quot;, {FIXED [Customer ID] : MIN([Order Date])})' />
```

**FIXED max date (respect filters)**

```xml
<column caption='Max Order Date' datatype='date' name='[Calculation_max_date]' role='dimension' type='ordinal'>
  <calculation class='tableau' formula='DATE({ FIXED : MAX([Order Date])})' scope-isolation='false' />
</column>
```

**FIXED order-level metric**

```xml
<column caption='Fixed Order D Days' datatype='real' name='[Calculation_fixed_days]' role='measure' type='quantitative'>
  <calculation class='tableau' formula='{ FIXED [Order ID]: MIN([Delivery Days]) }' scope-isolation='false' />
</column>
```

---

## Naming Convention

Internal calc names: **`[Calculation_<id>]`** where `<id>` is a **16–19 digit** integer. For programmatic generation, use a random **18–19 digit** number to reduce collisions (e.g. `Calculation_5571209093911105`).

**Caption** = display label; **name** = identifier used in other formulas.

---

## Worksheet Reference to a Calculated Field

When a worksheet uses a field defined in the main datasource, **reference only** — **do not** repeat the formula. Add a **minimal** `<column>` in that worksheet’s `<datasource-dependencies>`:

```xml
<column caption='Date filter (calc)' datatype='boolean' name='[Date filter (calc)_20250606]' role='dimension' type='nominal' />
```

No `<calculation>` child on the worksheet copy.

---

## Format Defaults

Set `default-format` on the datasource `<column>` when you need consistent display. **Repeat** on worksheet dependency columns if Tableau expects it on each occurrence.

| Pattern | `default-format` |
|---------|------------------|
| Percentage ratios | `'p0.0%'` |
| Currency (USD-style) | `'c"$"#,##0;-"$"#,##0'` |
| Integers with thousands separator | `'#,##0'` |

Example:

```xml
<column caption='Profit Ratio' datatype='real' default-format='p0.0%'
        name='[Calculation_5571209093911105]' role='measure' type='quantitative'>
  <calculation class='tableau' formula='SUM([Profit])/SUM([Sales])' />
</column>
```

---

## Folder Organization

Group calcs under **`<folders-common>`** inside `<datasource>` (after `<column>` definitions). Use **`<layout show-structure='true' />`** so folders appear in the Data pane.

```xml
<folders-common>
  <folder name='Sales: CY vs PY'>
    <folder-item name='[Calculation_cy_sales]' type='field' />
    <folder-item name='[Calculation_py_sales]' type='field' />
  </folder>
  <folder name='Dynamic Category'>
    <folder-item name='[Calculation_dyn_cat]' type='field' />
  </folder>
</folders-common>
<layout dim-ordering='alphabetic' measure-ordering='alphabetic'
        show-structure='true' />
```

**KPI-oriented folder names (convention):**

- `"[Metric]: CY vs PY"` — CY, PY, % change, # change, arrow, sign prefix
- `"Days"` / fulfillment base calcs
- `"Dynamic Category"` — parameter-driven `CASE` dimensions
- `"Display View"` — Boolean visibility toggles
- `"Format Support"`, `"Rolling 12 Months"`, `"Plot"` — helpers as needed

---

## Dashboard Types

| Type | Cadence | Layout | Key elements |
|------|---------|--------|--------------|
| **Executive** | Snapshot / weekly | Inverted pyramid, Z-pattern | BANs top **15–20%**, **3–5 KPIs**, trends mid ~45%, detail bottom ~30%; limited accent palette; diverging palettes for accessibility where needed |
| **Operational** | Near real-time | Status-first, F-pattern | Status bar / thresholds; bullet vs targets; last-updated; filters left **15–20%** |
| **Strategic** | Weekly–quarterly | Trend-focused | Long-run lines (**12+** months); targets as reference lines; dual-axis when needed; annotate events |
| **Analytical** | Ad hoc | Progressive disclosure | Cascading filters; parameter drill L1→L2→L3; set actions; analyst workbench |

See [dashboard-design-best-practices.md](dashboard-design-best-practices.md) and [programmatic-twb-learnings.md](programmatic-twb-learnings.md) for layout detail.

---

## BAN / KPI Card Patterns

**BAN** = large primary number for a KPI (total, growth %, etc.).

**Design notes**

- **Placement:** Top **15–20%** on executive-style dashboards (inverted pyramid).
- **Content:** Label, **current value 20–28pt bold**, trend (color + ▲/▼), % change, optional sparkline.
- **Density:** **3–5** KPIs per dashboard to avoid overload.

**Build pattern (current / previous + conditional color)**

1. Time on Columns; measure on Text; optionally **percent-difference** or custom table calc for change.
2. **Boolean** for latest vs prior period, e.g. compare `MAX([Order Date])` to `WINDOW_MAX(MAX([Order Date]))` and prior bucket via `DATEADD`.
3. Split **positive / negative** change into separate calcs for red/green (or dual marks) when needed.
4. **Symbols:** ▲ ▼ ▶ in calculated fields or custom number format strings.

**Cross-references**

- Full KPI card layout, containers, and trend pairing: [kpi-cards-and-trends.md](kpi-cards-and-trends.md)
- Validated BAN with comparisons (programmatic TWB): [programmatic-twb-learnings.md](programmatic-twb-learnings.md) **§13.22**
- Alternative deep-dive (Flerlage-style period bucket): [kpi-card-flerlage-twins.md](kpi-card-flerlage-twins.md)

**XML hint (Text mark)**

- `<mark class='Text' />` with `<encodings><text column='[datasource].[sum:Measure:qk]' /></encodings>` (or `usr:` for calcs).

---

## YoY and Period-Over-Period

### Approach 1: LOOKUP table calculation

Regular time grain on the view; adjust offset to the period (e.g. quarter: `-4`, month: `-12`).

```
(SUM([Sales]) - LOOKUP(SUM([Sales]), -4)) / ABS(LOOKUP(SUM([Sales]), -4))
```

### Approach 2: Boolean row-level splits (no table calc in the growth definition)

- **This year:** `IF YEAR([Order Date]) = YEAR(TODAY()) THEN [Sales] END`
- **Last year:** `IF YEAR([Order Date]) = YEAR(DATEADD('year', -1, TODAY())) THEN [Sales] END`
- **YoY growth:** `(SUM([Sales This Year]) - SUM([Sales Last Year])) / SUM([Sales Last Year])`

### Approach 3: LOD

```
{ FIXED YEAR([Order Date]) : SUM([Sales]) }
```

Chain with table calcs or secondary calcs for growth.

### XML example

```xml
<column caption='YoY Growth' datatype='real' default-format='p0.0%'
        name='[Calculation_9876543210987654321]' role='measure' type='quantitative'>
  <calculation class='tableau'
    formula='(SUM([Sales]) - LOOKUP(SUM([Sales]), -4)) / ABS(LOOKUP(SUM([Sales]), -4))' />
</column>
```

**YoY % split for dual-color formatting** (datasource + table calc on rows):

```xml
<column caption='YOY Growth - collection' datatype='real' name='[Calculation_14425659014385714]'
        role='measure' type='quantitative'>
  <calculation class='tableau'
    formula='(ZN([Calculation_14636757045186578]) - LOOKUP(ZN([Calculation_14636757045186578]), -1)) &#10;/ ABS(LOOKUP(ZN([Calculation_14636757045186578]), -1))'>
    <table-calc ordering-type='Rows' />
  </calculation>
</column>

<column caption='YOY % Down (red)' datatype='real' name='[Calculation_14425659014385715]'
        role='measure' type='quantitative'>
  <calculation class='tableau'
    formula='IF [Calculation_14425659014385714] &lt; 0 THEN [Calculation_14425659014385714] END'>
    <table-calc ordering-type='Rows' />
  </calculation>
</column>

<column caption='YOY % Up (green)' datatype='real' name='[Calculation_14425659014385716]'
        role='measure' type='quantitative'>
  <calculation class='tableau'
    formula='IF [Calculation_14425659014385714] &gt;= 0 THEN [Calculation_14425659014385714] END'>
    <table-calc ordering-type='Rows' />
  </calculation>
</column>
```

---

## Dynamic Period Comparison

Three-parameter pattern for **current vs comparison** windows.

### Parameters

- **[Date Part]** (string list): `"week"`, `"month"`, `"quarter"`, `"year"`.
- **[Period]** (integer): `0` = this period, `-1` = last period, etc.
- **[Comparison]** (integer): `-1` = prior period, `1` = same period **prior year** (YoY).

### Core calcs

**Start of selected period**

```
DATEADD([Date Part], [Period], DATETRUNC([Date Part], TODAY()))
```

**End of selected period**

```
DATEADD('day', -1, DATEADD([Date Part], 1, [Start Date]))
```

**Comparison window**

- If `[Comparison] = 1` (YoY): offset by **-52** (weeks), **-12** (months), **-4** (quarters), **-1** (year) according to `[Date Part]`.
- If `[Comparison] = -1` (prior period): offset by **-1** period.

**Classifier dimension**

```
IF [Order Date] >= [Start Date] AND [Order Date] <= [End Date] THEN "Current"
ELSEIF [Order Date] >= [Start Date Comparison] AND [Order Date] <= [End Date Comparison]
  THEN "Comparison"
END
```

Use in filters or on Columns/Color for side-by-side current vs comparison.

---

## Measure Swapper and Dynamic Dimension Picker

### Measure swapper (parameter-driven)

**Parameter:** string list (e.g. Sales, Profit, Quantity).

**Calc:**

```
CASE [Selected Measure Parameter]
  WHEN "Sales" THEN SUM([Sales])
  WHEN "Profit" THEN SUM([Profit])
  WHEN "Quantity" THEN SUM([Quantity])
END
```

In XML: `WHEN &quot;Sales&quot; THEN SUM([Sales])`, etc.

### Dynamic dimension picker

**Parameter:** string list (e.g. Region, Category, Segment).

**Calc:**

```
CASE [Selected Dimension Parameter]
  WHEN "Region" THEN [Region]
  WHEN "Category" THEN [Category]
  WHEN "Segment" THEN [Segment]
END
```

Place on Rows/Columns as discrete. Encode quotes in XML attributes as `&quot;`.

---

## KPI Dashboard Calculated Field Patterns

Patterns from a **Superstore-style shipping metrics** KPI workbook: CY/PY pairs, change metrics, arrows, visibility, dynamic dimension.

### Year and base metrics

```xml
<column caption='Year' datatype='integer' name='[Calculation_year]' role='dimension' type='ordinal'>
  <calculation class='tableau' formula='YEAR([Order Date])' />
</column>

<column caption='Delivery Days' datatype='real' name='[Calculation_delivery_days]' role='measure' type='quantitative'>
  <calculation class='tableau'
    formula='IF [Ship Mode] = &apos;Same Day&apos; THEN [Fullfilment Days] + 0&#10;ELSEIF [Ship Mode] = &apos;First Class&apos; THEN [Fullfilment Days] + 2&#10;ELSEIF [Ship Mode] = &apos;Second Class&apos; THEN [Fullfilment Days] + 5&#10;ELSEIF [Ship Mode] = &apos;Standard Class&apos; THEN [Fullfilment Days] + 7&#10;ELSE 0 END' />
</column>
```

### CY / PY pair

```xml
<column caption='CY Delivery Days' datatype='real' name='[Calculation_cy_ddays]' role='measure' type='quantitative'>
  <calculation class='tableau'
    formula='AVG(IF ([Year]) = YEAR([Max Order Date]) THEN [Fixed Order D Days] END)' />
</column>

<column caption='PY Delivery Days' datatype='real' name='[Calculation_py_ddays]' role='measure' type='quantitative'>
  <calculation class='tableau'
    formula='AVG(IF ([Year]) = YEAR([Max Order Date]) - 1 THEN [Fixed Order D Days] END)' />
</column>
```

### Change, %, sign, arrows

```xml
<column caption='# Change (D)' datatype='real' name='[Calculation_num_change_d]' role='measure' type='quantitative'>
  <calculation class='tableau' formula='[CY Delivery Days] - [PY Delivery Days]' />
</column>

<column caption='% Change (D)' datatype='real' name='[Calculation_pct_change_d]' role='measure' type='quantitative'>
  <calculation class='tableau'
    formula='([CY Delivery Days] - [PY Delivery Days]) / [PY Delivery Days]' />
</column>

<column caption='% Change +|- (D)' datatype='string' name='[Calculation_pct_sign_d]' role='dimension' type='nominal'>
  <calculation class='tableau'
    formula='IF [% Change (D)] &gt; 0 THEN &apos;+&apos; ELSE &apos;&apos; END' />
</column>

<column caption='CY vs PY Symbol (D)' datatype='string' name='[Calculation_arrow_d]' role='dimension' type='nominal'>
  <calculation class='tableau'
    formula='IF [CY Delivery Days] &gt; [PY Delivery Days] THEN &quot;▲&quot;&#10;ELSEIF [CY Delivery Days] &lt; [PY Delivery Days] THEN &quot;▼&quot;&#10;ELSEIF [CY Delivery Days] = [PY Delivery Days] THEN &quot;▶&quot;&#10;END' />
</column>
```

### Visibility toggles (dynamic zones)

```xml
<column caption='M2 T|F' datatype='boolean' name='[Calculation_m2_tf]' role='dimension' type='nominal'>
  <calculation class='tableau'
    formula='[Parameters].[Dynamic Category] = &apos;Sales&apos;' />
</column>

<column caption='1-Viz Sales T|F' datatype='boolean' name='[Calculation_viz_sales_tf]' role='dimension' type='nominal'>
  <calculation class='tableau'
    formula='[Parameters].[View] = 1 AND [Parameters].[Dynamic Category] = &apos;Sales&apos;' />
</column>
```

### Dynamic dimension switcher

```xml
<column caption='Dynamic Category' datatype='string' name='[Calculation_dyn_cat]' role='dimension' type='nominal'>
  <calculation class='tableau'
    formula='CASE [Parameters].[Dynamic Category Param]&#10;WHEN &apos;Shipping&apos; THEN [Ship Mode]&#10;WHEN &apos;Product&apos; THEN [Segment]&#10;WHEN &apos;Location&apos; THEN [Region]&#10;END' />
</column>
```

---

## Pitfalls

Full error catalog: [error-codes-and-pitfalls.md](error-codes-and-pitfalls.md).

**Calc-oriented quick list**

| Issue | Pointer |
|-------|---------|
| Manual string concatenation for `formula=` | Use an XML library; encoding mistakes break loads |
| Duplicate `[Calculation_…]` IDs | Unique per datasource |
| `role` / `type` / `datatype` mismatch | Follow tables above; wrong combo breaks pills |
| Missing `class='tableau'` on `<calculation>` | Formula may be ignored |
| Table calc only in datasource | Add matching `<column-instance>` + `<table-calc>` in worksheet |
| Parameters datasource | `hasconnection='false'`, `inline='true'`; no connection |
| `derivation` on `<column>` | **D2E8DA72** — belongs on `<column-instance>` only |
| Date range `<range>` | No `period` attribute (**D2E8DA72**) |
| LOD filter interaction | Use `scope-isolation='false'` or context filters when FIXED must respect filters |
| Field refs | Must match `name` exactly (case, brackets) |

---

## Quick Templates

### Simple measure (ratio)

```xml
<column caption='Profit Ratio' datatype='real' name='[Calculation_5571209093911105]' role='measure' type='quantitative'>
  <calculation class='tableau' formula='SUM([Profit])/SUM([Sales])' />
</column>
```

### Boolean filter calc

```xml
<column caption='Date filter (calc)' datatype='boolean' name='[Date filter (calc)_20250606]' role='dimension' type='nominal'>
  <calculation class='tableau' formula='CASE [Parameters].[Date filter Param] WHEN &quot;Custom&quot; THEN DATE([paid_date]) &gt;= [Parameters].[Start date] AND ... END' />
</column>
```

### Table calc (previous value)

```xml
<column caption='Previous Value' datatype='real' name='[Calculation_prev_001]' role='measure' type='quantitative'>
  <calculation class='tableau' formula='LOOKUP(ZN([Some Measure]), -1)'>
    <table-calc ordering-type='Rows' />
  </calculation>
</column>
```

### LOD (FIXED max date, respects filters)

```xml
<column caption='Max Order Date' datatype='date' name='[Calculation_lod_001]' role='dimension' type='ordinal'>
  <calculation class='tableau' formula='DATE({ FIXED : MAX([Order Date])})' scope-isolation='false' />
</column>
```

### Parameter placeholder in calc

```xml
<column caption='Threshold flag' datatype='boolean' name='[Calculation_param_001]' role='dimension' type='nominal'>
  <calculation class='tableau' formula='[Sales] &gt; [Parameters].[Min Sales]' />
</column>
```

### Verbose column (optional Desktop-style attributes)

```xml
<column aggregation='User' caption='Gross Collection' datatype='real' default-type='quantitative'
        name='[Calculation_14636757045186578]' pivot='key' role='measure' type='quantitative'
        user-datatype='real' visual-totals='Default'>
  <calculation class='tableau' formula='SUM( &#10; IF [order_status] &lt;&gt; &apos;UNPAID&apos;&#10; THEN [usd_net_total]&#10;END&#10;)' />
</column>
```

### Hidden field

```xml
<column aggregation='Sum' caption='Churn Rate' datatype='real' default-type='quantitative'
        hidden='true' name='[Calculation_14496015231635458]' pivot='key'
        role='measure' type='quantitative' user-datatype='real' visual-totals='Default'>
  <calculation class='tableau' formula='SUM([churn])/SUM([renew_potential])' />
</column>
```

---

## Aggregate vs Row-Level Patterns (VALIDATED)

Tableau enforces strict separation between aggregate and row-level expressions within `IF`/`CASE` statements. All parts of an `IF`/`CASE` must be at the same aggregation level.

### Pattern: Row-level calc with aggregate wrapper

When a formula needs a row-level condition but aggregated results, split into two calculated fields:

**Step 1 — Row-level calc** (no `SUM()`):
```tableau
// Monthly Run Rate (row-level)
IF [Calculation_1008]   // [Is Current Month] — boolean calc
THEN IF ZN([ds_runrate]) = 0
     THEN ZN([moving_run_rate])
     ELSE ZN([ds_runrate]) END
ELSE ZN([actual])
END
```

**Step 2 — Aggregate calc** referencing step 1:
```tableau
// Run Rate monthly vs. Goal (aggregate)
IF ZN(SUM([goal])) > 0
THEN SUM([Calculation_1009]) / SUM([goal])   // SUM of Monthly Run Rate
END
```

### Pattern: SUM wrapping row-level CASE for period switching

When a `CASE` selects different row-level fields based on a parameter, wrap the entire CASE in `SUM()`:

```tableau
// Period Run Rate (aggregate)
SUM(
  CASE [Parameters].[Period]
  WHEN "MTD" THEN [Calculation_1009]   // Monthly Run Rate (row-level)
  WHEN "QTD" THEN [qtd_run_rate]       // row-level source field
  WHEN "YTD" THEN [ytd_run_rate]       // row-level source field
  END
)
```

### Pattern: Component calcs for multi-period metrics

Split complex multi-period formulas into standalone component calcs, then combine with a CASE:

```tableau
// Component 1: Run Rate monthly vs. Goal
IF ZN(SUM([goal])) > 0 THEN SUM([Calculation_1009]) / SUM([goal]) END

// Component 2: QTD vs Quarterly Goal
IF ZN(SUM([quarterly_goal])) > 0 THEN SUM([qtd_run_rate]) / SUM([quarterly_goal]) END

// Component 3: YTD vs Yearly Goal
IF ZN(SUM([yearly_goal])) > 0 THEN SUM([ytd_run_rate]) / SUM([yearly_goal]) END

// Combined: Run Rate vs Goal
CASE [Parameters].[Period]
WHEN "MTD" THEN [Calculation_1010]   // Run Rate monthly vs. Goal
WHEN "QTD" THEN [Calculation_1011]   // QTD vs Quarterly Goal
WHEN "YTD" THEN [Calculation_1012]   // YTD vs Yearly Goal
END
```

**Key rule:** Reference component calcs by **internal name** (`[Calculation_XXXX]`) in formulas, not by caption. Tableau resolves internal names within the same datasource.

### Anti-pattern: Mixed aggregation in IF

```tableau
// WRONG — "Cannot mix aggregate and non-aggregate"
IF [month] = DATETRUNC("month", TODAY())       // row-level condition
THEN IF ZN(SUM([ds_runrate])) = 0              // aggregate branch
     THEN ZN(SUM([moving_run_rate]))           // aggregate branch
     ELSE ZN(SUM([ds_runrate])) END
ELSE ZN(SUM([actual]))                         // aggregate branch
END
```

Fix: remove all `SUM()` from the branches to make it fully row-level, then aggregate in the parent calc.

---

## Cross-References

| Topic | Document |
|-------|----------|
| TWB schema (parameters, filters, zones) | [twb-comprehensive-reference.md](twb-comprehensive-reference.md) |
| Programmatic patterns, BAN reuse | [programmatic-twb-learnings.md](programmatic-twb-learnings.md) §11, **§13.22** |
| Column-instance / XML structure | [xml-schema-and-structure.md](xml-schema-and-structure.md) |
| Date filter on dashboard | [date-filter-dashboard-pattern.md](date-filter-dashboard-pattern.md) |
| Dashboard layout defaults | [default-desktop-dashboard-layout.md](default-desktop-dashboard-layout.md) |
| Tableau functions | [tableau-functions-reference.md](tableau-functions-reference.md) |
