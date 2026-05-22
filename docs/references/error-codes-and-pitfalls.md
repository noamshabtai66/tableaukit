# Tableau TWB Error Codes and Generation Pitfalls

Quick-lookup reference for errors encountered during programmatic TWB generation. For full validated context, see `programmatic-twb-learnings.md` section references.

> **Automated validation**: Most D2E8DA72 errors are now caught automatically by the `validate_twb()` function in each generator script, which runs XSD validation against the official `twb_2026.1.0.xsd` plus custom structural checks. If you encounter a D2E8DA72 error that the validator did not catch, add it to the Tier 2 structural checks and document it here.

## Error Code Quick-Lookup Table

| Error Code | Category | One-Line Cause | Section |
|------------|----------|----------------|---------|
| D2E8DA72 | Schema / validation | Datasource children not in required order (including `<aliases>` before `<column>`) | §2 |
| D2E8DA72 | Schema / validation | Worksheet / `<table>` children out of order, or missing `<simple-id>` after `<table>` | §5, §13.2 |
| D2E8DA72 | Schema / validation | `<column>` definitions appear after `<layout>` / `<style>` in datasource | §24.10 |
| D2E8DA72 | Schema / validation | `<zone-style>` not last among children of container zones | §13.12, §24.11 |
| D2E8DA72 | Schema / validation | Pane children out of order (`customized-tooltip` must precede `customized-label` and `style`) | §23l |
| D2E8DA72 | Schema / validation | `param-domain-type` not one of `any`, `list`, `range` | §5e |
| D2E8DA72 | Schema / validation | Relative-date filter uses `period-type-v2` in generated TWB | §13.17 |
| D2E8DA72 | Schema / validation | `param-domain-type="list"` with both `<members>` and `<range>` | §15.4 |
| D2E8DA72 | Schema / validation | `granularity` on `<range>` for date parameters (only `min` and `max`) | §15.12 |
| D2E8DA72 | Schema / validation | `<style-rule element>` not in enumeration | §13.15 |
| D2E8DA72 | Schema / validation | `derivation` on `<column>` (belongs on `<column-instance>` only) | §15.3, §15.7 |
| D2E8DA72 | Schema / validation | `luid` on `<repository-location>` | §15.2 |
| D2E8DA72 | Schema / validation | `mark-line-pattern` attribute in generated TWB load | §15.7 |
| D2E8DA72 | Schema / validation | `enable-sort-zone-taborder` in manifest (older Tableau) | §13.7 |
| D2E8DA72 | Schema / validation | `user:op` on `<filter>` | §27.12 |
| D2E8DA72 | Schema / validation | Duplicate window `name` across dashboard and worksheet | §27.12 |
| D2E8DA72 | Schema / validation | `<layout>` placement violates datasource content model | §27.12 |
| D2E8DA72 | Schema / validation | `align` on `<run>` | §27.12 |
| D2E8DA72 | Schema / validation | `<edit-parameter-action>` `name` not matching `\[...\]` | §25.1 |
| D2E8DA72 | Schema / validation | `auto-generated` on `<devicelayout>` | §25.2 |
| D2E8DA72 | Schema / validation | `<simple-id>` on dashboard without `uuid="{...}"` braces | §25.3 |
| D2E8DA72 | Schema / validation | `border-radius` on `<format>` | §25.7 |
| D2E8DA72 | Schema / validation | Invalid `<format attr>` name for the style-rule element | §24.13 |
| D2E8DA72 | Schema / validation | Undeclared elements in generated load (see §15.7 table) | §14.3–§14.4, §15.7 |
| DD3C47AE | Internal | Empty field identifier on a shelf — e.g. `<column name="[]"/>` + `[data].[none::nk]` on `<cols>`. Tableau shows only "Internal Error" with no further detail. | §DD3C47AE |
| A1E47F55 | Internal | `relative-date` filter on same field as cols/rows shelf | §13.16 |
| A1E47F55 | Internal | Relative-date filter with `include-future="false"` when exposed as dashboard filter zone | §13.17 |
| A1E47F55 | Internal | `<datasources>` / `<datasource-dependencies>` as direct children of `<dashboard>` | §13.18 |
| 018B7D29 | Internal | Custom SQL (`relation type="text"`) without `<metadata-records>` | §2 |
| 2805CF18 | Internal | Empty `<cards />` or empty `<viewpoint />` in `<window>` | §13.1 |
| 6EA18A9E | Internal | Multi-pane / structural issues (AVG(0) datatype, pane order, boolean calc shape, etc.) | §27.12 |

## D2E8DA72 — Schema/Validation Errors

The most common error. Indicates XML structure or attribute violations.

### Element Ordering Violations

**Symptom:** Schema validation errors (`element ... is not allowed for content model`).

**Cause:** Child elements in the wrong sequence.

**Canonical approach:**

- **Datasource (workbook):** Follow the order in §2 (`repository-location` … `aliases` before `column*` … `layout` … `style` … `datasource-dependencies*` …).
- **Worksheet:** `layout-options?`, then `<table>`, then `<simple-id>` (required). Inside `<table>`: `<view>` (with `datasources`, `datasource-dependencies`, filters, `shelf-sorts?`, `slices?`, `aggregation`), then `<style>`, then `<panes>`, then `<rows>` / `<cols>` (§5, §13.2).
- **Datasource inner sequence for columns vs layout:** All `<column>` elements before `<layout>` and `<style>` (§24.10).
- **Container zones:** `<zone-style>` after all child `<zone>` elements (§13.12, §24.11).
- **Pane:** `view → mark → … → customized-tooltip → customized-label → style` (§23l).

### Invalid Attribute Values

**Symptom:** `attribute ... is not declared`, `value not in enumeration`, or `value ... neither 'false' nor 'true'`.

**Cause:** Attribute not in the XSD for that element, or value outside allowed enumeration.

**Canonical approach:**

- **`param-domain-type`:** `any`, `list`, or `range` (§5e).
- **Relative-date filters:** use `period-type` in generated files; Tableau maps to `period-type-v2` on save (§13.17).
- **`mark-line-pattern`:** omit in generated TWBs; use Desktop after first open if dashed lines are required (§15.7).
- **Date range parameters:** `<range>` with `min` and `max` only (§15.12).
- **`<style-rule element>`:** one of `axis`, `cell`, `header`, `label`, `mark`, `pane`, `table`, `gridline`, `refline`, `refband`, `axis-title`, `worksheet` (§13.15).
- **`<edit-parameter-action name>`:** bracketed form, e.g. `name="[Set Sales]"` (§25.1).
- **`devicelayout`:** `name` such as `Phone`; no `auto-generated` attribute (§25.2).
- **Dashboard `<simple-id>`:** `uuid="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}"` (§25.3).
- **Rounded corners:** manifest `_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners` and `_.fcp.DashboardRoundedCorners.true...format` with `attr="corner-radius"` (§5d, §25.7).

### Undeclared Elements

**Symptom:** `no declaration found for element`.

**Cause:** Element not allowed in the schema for generated TWBs at that location.

**Canonical approach:**

- Omit `<manual-sort>` in initial generated files; use filter member order for measure order (§15.6, §15.7).
- Omit `<button>` / `<toggle-action>` in generated TWBs; use DZV datagraph + parameters (§15.7, §15.10, §20).
- For dynamic zone visibility, place `<datagraph>` as a **workbook-level** child after `<windows>`, not inside `<dashboard>` (§1, §15.7).
- **`customized-label`:** `formatted-text` as direct child of `customized-label` (§14.3).
- **`<style-rule element="mark">`:** use `<format>` only; mark class lives in `<pane><mark>` (§14.4).

### Undeclared Attributes

**Symptom:** `attribute ... is not declared for element`.

**Cause:** Attribute not defined on that element in the schema.

**Canonical approach:**

- **`repository-location`:** `derived-from`, `id`, `path`, `revision`, `site` only (§15.2).
- **`derivation`:** set on `<column-instance>`, not on `<column>` (§15.7).
- **Manifest:** omit `enable-sort-zone-taborder` unless targeting Tableau versions that declare it (§13.7).
- **Filters:** omit `user:op` on `<filter>` in generated TWBs (§27.12).
- **`<run>`:** omit `align` (§27.12).

### Mutually Exclusive Elements

**Symptom:** `element 'members' is not allowed for content model` (or equivalent).

**Cause:** `param-domain-type="list"` with both `<members>` and `<range>`.

**Canonical approach:** `list` → `<members>` only; `range` → `<range>` only; `any` → neither (§15.4).

### Invalid Style-Rule Element Names

**Symptom:** `value not in enumeration` for `style-rule` / `element`.

**Canonical approach:** Use only the enumerated names; gridlines via `element="gridline"`, zero line via `refline` / axis formatting as in §13.15.

---

## DD3C47AE — Internal Error (Empty Field References)

**Symptom:** Tableau Desktop refuses to open the .twbx with a generic "Internal Error — An unexpected error occurred and the operation could not be completed." The Help link redirects to the generic Tableau support landing page (the error code is intentionally opaque). The Desktop log (`~/Documents/My Tableau Repository/Logs/log.txt`) records only the `shortMessage` and offers no structural detail — XML parsing happens inside Tableau's internal WebView and never writes the parse failure to the log.

**Cause:** A worksheet places an empty field identifier on a shelf. Common shapes:

```xml
<column datatype="string" name="[]" role="dimension" type="nominal"/>
<column-instance column="[]" derivation="None" name="[none::nk]" pivot="key" type="nominal"/>
<cols>[data].[none::nk]</cols>
```

These bracket-pair identifiers arise when an upstream stage passes `name=""` or `None` into `f"[{name}]"`, or when an inst-name helper builds `[<agg>::<suffix>]` with the field-name slot empty.

**Mitigation in this engine (since the May 2026 hardening):**

- **Layer 1** — `engine/agentic/spec_validator.py`: empty `x`/`y`/`measure` fields and empty `calculated_fields[].name` are now `empty_field` blockers (not silently accepted).
- **Layer 1.5** — `engine/agentic/concept_compiler.py`: re-validate after `repair_spec()`; raise `EngineValidationError` (in `engine/agentic/errors.py`) if any blocker remains, instead of producing a .twbx.
- **Layer 2** — `engine/post_xml_validator.py`: regex+ET scan of the emitted .twb for `name="[]"`, `column="[]"`, `[none::*]` shelf refs, orphan `<column-instance column="[X]">` with no matching `<column name="[X]">` declaration, and empty `<remote-name>` / `<local-name>` in metadata-records. Raises `EngineXmlError` before the .twbx is packaged.
- **Defense-in-depth** — `engine/workbook_model.py:inst_name()` and `engine/twb_builder_v2.py:_build_chart_worksheet()` raise `ValueError` if asked to render a chart with an empty x/y axis.

**Canonical approach when authoring TWBs by hand:** never emit a `<column>` or `<column-instance>` whose `name=` or `column=` attribute is `"[]"`. Every shelf reference (`<cols>`, `<rows>`, `<color-one-way>`, `<size>`) must resolve to an instance whose underlying column is declared in the same datasource.

---

## A1E47F55 — Internal Errors

### Relative-Date Filter on Cols/Rows Field

**Symptom:** Internal error A1E47F55.

**Cause:** `relative-date` filter on the same date field that defines the cols or rows axis.

**Canonical approach:** Use a separate date field on the shelf, or a calculated date field for the axis, per §13.16 and §13.20.

### `include-future` on Dashboard Filter

**Symptom:** A1E47F55 when the relative-date filter is exposed as a dashboard filter zone.

**Cause:** Relative-date filter configuration incompatible with dashboard filter embedding.

**Canonical approach:** `include-future="true"` with `period-type` (§13.17).

### Dashboard-Level Datasource Dependencies

**Symptom:** A1E47F55.

**Cause:** `<datasources>` or `<datasource-dependencies>` as direct children of `<dashboard>`.

**Canonical approach:** Dashboard contains `<size>` and `<zones>` (and related zone content); datasources live under workbook `<datasources>` (§13.18).

---

## 018B7D29 — Missing Metadata Records

**Symptom:** Internal error 018B7D29.

**Cause:** Custom SQL connection (`relation type="text"`) without `<metadata-records>`.

**Canonical approach:** Include `<metadata-records>` with `<metadata-record class="column">` rows defining `remote-name`, `remote-type`, `local-name`, `parent-name`, `local-type`, `aggregation`, `contains-null` (§2).

---

## 2805CF18 — Malformed Window Structure

**Symptom:** Internal error 2805CF18 on open.

**Cause:** Empty `<cards />` or empty `<viewpoint />` in `<window>`.

**Canonical approach:** Populate dashboard windows with `<viewpoints>` (one `<viewpoint>` per embedded sheet) and `<active id="-1" />`; worksheet windows with full `<cards>` (edges, strips, card types) and `<viewpoint><zoom/></viewpoint>` (§13.1).

---

## Generated-TWB-Only Pitfalls

Elements valid in Desktop-saved files but rejected on **initial load** of generated TWBs unless replaced by the patterns in §14.3–§14.4, §15.6–§15.7, §15.10.

Table from §15.7 of `programmatic-twb-learnings.md`, plus related rows from §14.3–§14.4:

| Element/Attribute | Error | Notes |
|---|---|---|
| `<manual-sort>` | D2E8DA72: "no declaration found for element" | Tableau Desktop adds internally; not in schema for generated files |
| `mark-line-pattern` (format attr) | D2E8DA72: "value not in enumeration" | Fails at **both** table-level and pane-level `<style>` during initial TWB loading. Only valid in Tableau Desktop-saved files. Set dashed lines manually in Desktop after opening the generated workbook. |
| `[Multiple Values]` alone on rows/cols | "Malformed expression" | Only works in `(A + B)` dual-axis pattern or `<text>` encodings |
| `<button>` / `<toggle-action>` | D2E8DA72: "no declaration found for element 'button'" | The show/hide toggle button (`type-v2='dashboard-object'` with `<button>`) is NOT valid in generated TWBs. Use the DZV datagraph + parameter approach instead (§15.10). |
| `derivation` on `<column>` | D2E8DA72: "attribute 'derivation' is not declared for element 'column'" | `derivation` is only valid on `<column-instance>`, not `<column>`. |
| `<datagraph>` inside `<dashboard>` | D2E8DA72: "element 'datagraph' is not allowed" | `<datagraph>` must be a **workbook-level** element (direct child of `<workbook>`), placed after `<windows>`. NOT inside `<dashboard>`. |
| `group-label-config` in `customized-label` | D2E8DA72 (schema) | `formatted-text` as direct child of `customized-label` (§14.3) |
| `<mark>` inside `<style-rule element="mark">` | D2E8DA72 | Mark type belongs in `<pane>` only (§14.4) |

---

## Custom SQL Pitfalls

**`<` in SQL**

**Symptom:** Parameter resolution failures or parse errors after XML decode.

**Cause:** Custom SQL engine treats `<...>` as parameter markers.

**Canonical approach:** rewrite comparisons so the SQL text contains no `<` character (e.g. `b > a` instead of `a < b`) (§14.1). Wrap relation text in `<![CDATA[...]]>` for XML safety (§14.2).

**CDATA**

**Symptom:** XML parse failures on special characters.

**Cause:** Raw SQL in `<relation type="text">` without CDATA.

**Canonical approach:** embed SQL in `<![CDATA[...]]>`; post-process from ElementTree placeholders if needed (§14.2).

---

## Formula Pitfalls

**Tableau vs SQL**

**Symptom:** Invalid formula in calculated fields.

**Canonical approach:** `ISNULL()`, `IFNULL()`, `ZN()` per Tableau function reference; not SQL `IS NULL` (§14.9).

**`[Multiple Values]` on shelf**

**Symptom:** Malformed expression.

**Canonical approach:** Dual-axis `( [ds].[Multiple Values] + [ds].[usr:calc:qk] )` or encodings-only usage (§15.6).

**Parameter string values**

**Symptom:** `value neither 'false' nor 'true'` (boolean misread).

**Canonical approach:** supply literal quoted strings in the generator so the XML encoder emits a single level of quoting (e.g. Python `'"Sales"'` for the value) (§25.4).

**Cross-referenced calcs**

**Symptom:** Unresolved references in generated workbooks.

**Canonical approach:** Reference other calculated fields by their **internal name** (`[Calculation_XXXX]`) in formulas, not by caption. Example: `SUM([Calculation_1009]) / SUM([goal])` where `Calculation_1009` is the internal name of "Monthly Run Rate". Inline dependent logic as a fallback if cross-references fail (§25.6).

**Arrow / aggregate string calcs**

**Symptom:** `###` in BAN or non-evaluating fields.

**Canonical approach:** `derivation="User"` with `usr:` / `nk` for aggregate string measures (e.g. arrows) (§12.1, §25.11).

**Aggregate / non-aggregate mixing in IF expressions**

**Symptom:** "Cannot mix aggregate and non-aggregate comparisons or results in 'IF' expressions."

**Cause:** An `IF` or `CASE` condition uses a row-level field (e.g. `[month] = DATETRUNC(...)`) but the THEN/ELSE branches contain `SUM()` or other aggregate functions. All parts of an `IF` expression must be at the **same** aggregation level.

**Canonical approach:**
- Make the entire calc **row-level** (no `SUM()`): `IF [Is Current Month] THEN ZN([ds_runrate]) ELSE ZN([actual]) END`
- Then aggregate in the **parent** calc: `SUM([Calculation_1009]) / SUM([goal])`
- Or wrap a row-level CASE inside SUM: `SUM(CASE [Period] WHEN "MTD" THEN [Monthly Run Rate] WHEN "QTD" THEN [qtd_run_rate] END)`
- **Never** mix `[field]` conditions with `SUM([field])` branches in the same IF/CASE.

**Boolean calc field as IF condition**

**Symptom:** Row-level boolean calc works as IF condition without repeating the expression.

**Canonical approach:** Boolean calculated fields (e.g. `[Is Current Month]` = `[month] = DATETRUNC("month", TODAY())`) can be used directly as IF conditions: `IF [Calculation_1008] THEN ... END`. Reference by internal name in formulas.

---

## Format Attribute Pitfalls

**Quick reference (valid `element` → `attr` names)** — §24.13:

| Element | Valid attrs |
|---------|-------------|
| `axis` | `stroke-size`, `line-visibility`, `display`, `color`, `font-size`, `title` |
| `axis-title` | `display` |
| `header` | `stroke-size`, `width`, `color`, `font-weight` |
| `mark` | `mark-color`, `mark-transparency`, `mark-labels-show`, `mark-labels-cull`, `mark-labels-mode`, `mark-labels-line-first`, `mark-labels-line-last`, `mark-labels-range-min`, `mark-labels-range-max`, `mark-labels-range-scope`, `mark-labels-range-field`, `has-stroke`, `size` |
| `table` | `show-null-value-warning` |
| `gridline` / `zeroline` / `table-div` | `line-visibility` |
| `worksheet` | `background-color`, `display-field-labels` |
| `field-labels` | `display` (with `scope`) |
| `refline` | (none commonly used in reference) |

**Symptom:** D2E8DA72 for invalid `attr` names.

**Canonical approach:** use only attributes listed for that style-rule element; verify against a working `.twb` when adding new formatting (§24.13).

**Rounded corners**

**Symptom:** D2E8DA72 if using a non-enumerated format attribute.

**Canonical approach:** `document-format-change-manifest` entry `_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners` and corner radius via `_.fcp.DashboardRoundedCorners.true...format` (§5d, §25.7).

---

## Multi-Tab Dashboard Pitfalls (§28)

**zone-style ordering in containers**

**Error:** `D2E8DA72` — `element 'zone' is not allowed for content model '(formatted-text,layout-cache?,zone,flipboard,zone-style?)'`

**Symptom:** Multiple errors pointing to closing tags of root `layout-basic` zones, one per dashboard tab.

**Canonical approach:** `<zone-style>` must be the LAST child element inside `layout-basic` and `layout-flow` containers. Place it after all child `<zone>` elements (§28.1).

**Multiple measures on a shelf**

**Error:** `Malformed expression: unable to associate operators with operands.`

**Symptom:** Worksheet fails to load when `<rows>` or `<cols>` contains space-separated measures (e.g., `[ds].[sum:a:qk] [ds].[sum:b:qk]`).

**Canonical approach:** Never use space-separated measures on shelves in generated TWBs. Use the dual-axis parentheses+plus pattern instead: `([ds].[sum:goal:qk] + [ds].[sum:actual:qk])`. This works for both the same measure twice (sparklines) and two different measures (grouped bars). Requires 3 panes, Measure Names color encoding, and datasource-level prerequisites (§28.2, §28.12).

**Implicit aggregation in cross-referenced calcs**

**Symptom:** BAN fields show `SUM(AGG(...))` errors or incorrect results because percentage-change calcs reference other aggregated calcs but are assigned `derivation="Sum"` instead of `derivation="User"`.

**Canonical approach:** Any formula containing `[Calculation_` (a reference to another calculated field) should be treated as implicitly aggregated and use `derivation="User"` / `usr:` prefix (§28.3).
