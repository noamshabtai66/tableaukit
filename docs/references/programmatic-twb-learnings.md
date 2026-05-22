# Programmatic TWB Creation — Learnings from Compass Artifact

This document captures technical learnings from the *Programmatic Tableau workbook creation via TWB XML* artifact for use when generating or editing .twb files. It supplements [twb-comprehensive-reference.md](twb-comprehensive-reference.md) and the rest of the skill references.

---

## 1. Root structure and compatibility (VALIDATED)

- **Workbook children MUST follow this exact order**: `document-format-change-manifest`, `preferences`, `style`, `datasources`, `actions?`, `worksheets`, `dashboards`, `windows`, `datagraph?`.
- If the workbook has parameter actions, add `<actions>` between `datasources` and `worksheets`.
- If the workbook uses Dynamic Zone Visibility, add `<datagraph>` AFTER `windows`.
- **`version='18.1'`** has been stable since ~Tableau 2019 through 2025.x. Use it for compatibility.
- **`source-build`** carries the actual version string (e.g. `'2025.3.3 (20253.26.0206.0336)'`). Tableau Desktop may auto-upgrade the manifest when opening.
- **Manifest entries for DZV/Parameter Actions**: `DatagraphCoreV1`, `DatagraphNodeDashboardZoneVisibilityV1`, `DatagraphNodeSingleValueFieldV1`, `ParameterAction`, `ParameterActionClearSelection`, `ParameterDefaultValues`, `ZoneVisibilityControl`.
- **Manifest entries for sorting (`shelf-sorts`)**: `IntuitiveSorting`, `IntuitiveSorting_SP2`. Without these, Tableau rejects `<shelf-sorts>` with "no declaration found" error.
- **Always include**: `AnimationOnByDefault`, `DatabricksCatalog`, `ISO8601DefaultCalendarPref`, `IntuitiveSorting`, `IntuitiveSorting_SP2`, `MarkAnimation`, `ObjectModelEncapsulateLegacy`, `ObjectModelTableType`, `SchemaViewerObjectModel`, `SetMembershipControl`, `SheetIdentifierTracking`, `WindowsPersistSimpleIdentifiers`, `ZoneFriendlyName`, `_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners`.
- **For navigation buttons**: Add `BasicButtonObject`, `BasicButtonObjectTextSupport` (see §20a).
- **For multi-dashboard DZV**: Add `DatagraphCoreV1`, `DatagraphNodeDashboardZoneVisibilityV1`, `DatagraphNodeSingleValueFieldV1`, `ZoneVisibilityControl`.
- **Top-N filters**: Do NOT use `<filter class="top">`. Use `class="categorical"` with nested `groupfilter function="end"` (see §5c).

---

## 2. Datasources and connections (VALIDATED)

- **Datasource children MUST follow this exact order** (Error D2E8DA72 if violated): `repository-location?`, `connection?`, `utility-dimensions?`, `dimension*`, `overridable-settings?`, `aliases?`, `column*`, `column-instance*`, `group?`, `mapped-images?`, `drill-paths?`, `unlinked-server-hierarchies?`, `folders-common?`, `folders-parameters?`, `actions?`, `calculated-members?`, `extract?`, `layout?`, `style`, `semantic-values?`, `date-options?`, `default-date-format?`, `default-sorts?`, `field-sort-info?`, `datasource-dependencies*`, `explainability?`, `filter`, `object-graph?`. **CRITICAL**: `<aliases>` MUST come BEFORE any `<column>` elements. Placing `<aliases>` after `<column>` causes `element 'aliases' is not allowed for content model` error.
- **`<metadata-records>` MUST be included** for Custom SQL (`relation type="text"`) connections. Without them, Tableau throws internal error `018B7D29`. Each `<metadata-record class='column'>` must define: `remote-name`, `remote-type`, `local-name`, `parent-name`, `local-type`, `aggregation`, `contains-null`.
- **Remote type codes**: `130` = string, `20` = integer, `5` = real/double, `7` = datetime, `133` = date, `11` = boolean.
- **Do NOT include `<connection-customization>` or `<semantic-values>` elements** when generating programmatically — they can cause validation errors (`value neither false nor true`).
- **`<cols>` mapping** maps shorthand field names to fully qualified table references (e.g. `[Sales]` → `[Orders].[Sales]`).
- Connection `class` values: `'excel-direct'`, `'textscan'` (CSV), `'sqlserver'`, `'postgres'`, `'hyper'`, `'snowflake'`, `'databricks'`, etc.

---

## 3. Calculated fields and formula encoding

- **Calculation names**: pattern `[Calculation_XXXXXXXXXXXXXXXXXXX]` where X is a **19-digit random number** (e.g. `Calculation_5571209093911105`).
- **Formula encoding** (non-negotiable):

| Character | Encoding | Example |
|-----------|----------|---------|
| `"` (double quote) | `&quot;` | `&quot;Consumer&quot;` |
| `<` | `&lt;` | `[Sales]&lt;100` |
| `>` | `&gt;` | `[Sales]&gt;500` |
| `&` | `&amp;` | `[A] &amp; [B]` |
| Newline (CR+LF) | `&#13;&#10;` | Multi-line formulas |

- **Curly braces `{}` for LOD** do not need encoding. CDATA is not used; Tableau uses standard XML entity encoding only.

---

## 4. Column-instance naming

- Every field on a shelf uses a **column-instance** name: `[derivation:FieldName:keytype]`.
- **Suffixes**: `nk` = nominal key (discrete), `qk` = quantitative key (continuous), `ok` = ordinal key.
- **Derivation examples**: `none:`, `sum:`, `avg:`, `cnt:`, `cntd:`, `min:`/`max:`, `attr:`, `yr:`/`mn:`/`qr:` (date parts), `usr:` (user calculation). **Month truncation** can appear as `tmn:` (e.g. `[tmn:Order Date:qk]`).
- Shelf references must be **fully qualified**: `[datasource_name].[column_instance_name]`.

---

## 5. Worksheet element ordering (VALIDATED — Error D2E8DA72)

Each `<worksheet>` MUST contain children in this order:
```
worksheet
 ├── layout-options?        (optional: title, etc.)
 ├── table                  (REQUIRED)
 │    ├── view              (REQUIRED)
 │    │    ├── datasources
 │    │    ├── datasource-dependencies*
 │    │    ├── filter*
 │    │    ├── shelf-sorts?
 │    │    ├── slices?
 │    │    └── aggregation
 │    ├── style
 │    ├── panes
 │    ├── rows
 │    └── cols
 └── simple-id              (REQUIRED — uuid format)
```

**CRITICAL**: `rows` and `cols` go inside `<table>`, NOT inside `<view>`. Missing `<simple-id>` causes load error.

---

## 5b. BAN/KPI card worksheet pattern (VALIDATED)

A BAN worksheet is a text-only card showing a number. Key patterns:
- `<pane>` with `<mark class="Text">` — NOT "Bar" or "Automatic"
- `<customized-label>` inside pane with `<formatted-text>` runs for title, value, comparison
- Field references in label runs MUST use `<![CDATA[<field_ref>]]>` — not entity-encoded `&lt;`/`&gt;`
- `<style>` rules to hide axes, headers, show mark labels:

```xml
<style>
  <style-rule element="axis">
    <format attr="stroke-size" value="0" />
    <format attr="line-visibility" value="off" />
  </style-rule>
  <style-rule element="axis-title">
    <format attr="display" value="off" />
  </style-rule>
  <style-rule element="header">
    <format attr="stroke-size" value="0" />
  </style-rule>
  <style-rule element="mark">
    <format attr="mark-labels-show" value="true" />
    <format attr="mark-labels-cull" value="true" />
  </style-rule>
</style>
```

- Dashboard `<layout-cache>` for BAN zones: `type-h="cell" type-w="cell"` (NOT scalable)
- Card styling (borders, background, margin) goes on a PARENT `layout-flow` container zone, not on the worksheet zone itself

---

## 5b2. Button worksheet pattern (VALIDATED)

Button worksheets trigger parameter actions on click. Two types:

### Text button (e.g. "▶ Details")

```xml
<mark class="Text" />
<encodings>
  <lod column="[ds].[none:Calculation_XXX:nk]" />
</encodings>
<customized-label>
  <formatted-text>
    <run fontname="Tableau Bold" fontsize="14" fontcolor="#2D4B8E">▶ Details</run>
  </formatted-text>
</customized-label>
```

### Shape button — filled X close (ALWAYS use for DZV close buttons)

```xml
<mark class="Shape" />
<mark-sizing mark-sizing-setting="marks-scaling-off" />
<encodings>
  <lod column="[ds].[none:Calculation_XXX:nk]" />
</encodings>
<style>
  <style-rule element="mark">
    <format attr="shape" value=":filled/x" />
    <format attr="mark-color" value="#2D4B8E" />
    <format attr="size" value="2" />
  </style-rule>
</style>
```

**Rule**: Always use this filled X shape button as the close/dismiss button when implementing DZV panels.

**Shape value formats**: `:filled/circle`, `:filled/square`, `:filled/x`, `:filled/diamond`, `:filled/triangle-up`, `Arrows/1-8.png` (built-in), `:custom/Name.png` (custom).

**Key rules**:
- LOD field uses `derivation="None"` (`none:` prefix) — NOT `usr:`
- Parameter action `source-field` must match the LOD column-instance derivation
- `mark-sizing` with `marks-scaling-off` prevents shape from scaling with data
- Pane-level `<style>` (inside `<pane>`) sets the shape, separate from table-level `<style>`

---

## 5c. Bar chart worksheet pattern (VALIDATED)

```xml
<view>
  <datasources>...</datasources>
  <datasource-dependencies>...</datasource-dependencies>
  <!-- Sort descending by measure (requires IntuitiveSorting manifest entry) -->
  <shelf-sorts>
    <shelf-sort-v2 dimension-to-sort="[ds].[none:product_name:nk]"
                   direction="DESC" is-on-innermost-dimension="true"
                   measure-to-sort-by="[ds].[usr:calc:qk]" shelf="rows" />
  </shelf-sorts>
  <aggregation value="true" />
</view>
<style>
  <style-rule element="axis">
    <format attr="stroke-size" value="0" />
    <format attr="line-visibility" value="off" />
    <!-- Hide axis on BOTH rows and cols scopes -->
    <format attr="display" class="0" field="[ds].[usr:calc:qk]" scope="rows" value="false" />
    <format attr="display" class="0" field="[ds].[usr:calc:qk]" scope="cols" value="false" />
  </style-rule>
  <style-rule element="header">
    <format attr="stroke-size" value="0" />
    <!-- Hide dimension header (field-scoped, NOT blanket display=false which crashes) -->
    <format attr="display" class="0" field="[ds].[none:dim:nk]" scope="rows" value="false" />
  </style-rule>
  <style-rule element="mark">
    <format attr="mark-labels-show" value="true" />
    <format attr="mark-labels-cull" value="true" />
  </style-rule>
  <!-- Always left-align bar chart labels -->
  <style-rule element="label">
    <format attr="text-align" value="left" />
  </style-rule>
  <!-- Hide row field labels ("product_name" text above dimension) -->
  <style-rule element="worksheet">
    <format attr="display-field-labels" scope="rows" value="false" />
  </style-rule>
  <style-rule element="refline">
    <format attr="line-visibility" value="off" />
  </style-rule>
  <style-rule element="gridline">
    <format attr="line-visibility" value="off" />
  </style-rule>
  <style-rule element="axis-title">
    <format attr="display" value="off" />
  </style-rule>
</style>
```

**Rules**:
- Always left-align bar chart labels: `<style-rule element="label"><format attr="text-align" value="left" /></style-rule>`
- Do NOT use blanket `<format attr="display" value="false" />` on `header` — it crashes Tableau. Always use field-scoped format with `class="0"`, `field`, and `scope`.

### Top-N filter pattern (VALIDATED)

Top-N is NOT `class="top"`. It uses `class="categorical"` with nested `groupfilter function="end"`:

```xml
<filter class="categorical" column="[ds].[none:country:nk]">
  <groupfilter count="10" end="top" function="end" units="records"
               user:ui-marker="end" user:ui-top-by-field="true">
    <groupfilter direction="DESC" expression="[Calculation_XXX]"
                 function="order" user:ui-marker="order">
      <groupfilter function="level-members" level="[none:country:nk]"
                   user:ui-enumeration="all" user:ui-marker="enumerate" />
    </groupfilter>
  </groupfilter>
</filter>
```

Also requires `<slices><column>[ds].[none:country:nk]</column></slices>` in the view.
The `user:` prefix maps to `xmlns:user="http://www.tableausoftware.com/xml/user"`. Use `ET.register_namespace("user", ...)` in Python.

**Rule**: Always apply Top-10 filtering on bar chart dimensions that have more than 20 distinct values (e.g., country). This keeps the chart readable and avoids long scrollable lists.

---

## 5d. Dashboard zones (VALIDATED)

- **100,000 units = 100%** of the parent container (proportional, not pixels). A zone with `h='50000'` is 50% of parent height.
- **`<size>` on the dashboard** is in **actual pixels** (e.g. `maxheight='900' maxwidth='1300'`).
- **Zone IDs**: unique integers within a dashboard; start at 3 to avoid collisions with built-in IDs.
- **Worksheet zones**: use `name='SheetName'` without `type-v2` attribute.
- **`zone-style`** for a zone MUST come AFTER all child zones (last child of its parent).
- **Layout-cache ordering**: inside worksheet zones, `<layout-cache>` comes first, then `<zone-style>` (if any).
- **Card-like KPI containers**: Apply borders/background/margin to a parent `layout-flow` container zone (`param="vert"`), not directly to the worksheet zone.
- **DZV panel**: ALL zones controlled by DZV (panel AND all children) get `hidden-by-user="true"`. Each zone gets its own `dashboard-zone-visibility-node` in the datagraph, all connected to the same boolean field node.

### Container naming (ALWAYS APPLY)

**Rule**: Always add `friendly-name` attributes to ALL container zones (`type-v2="layout-flow"`). This is mandatory for every generated dashboard. It makes the Layout panel in Tableau readable and maintainable.

```xml
<zone h="100000" id="3" param="vert" type-v2="layout-flow"
      friendly-name="Main Section" w="100000" x="0" y="0">
  <zone h="14000" id="5" param="horz" type-v2="layout-flow"
        friendly-name="KPI Row" w="100000" x="0" y="5000">
    <zone h="14000" id="6" param="vert" type-v2="layout-flow"
          friendly-name="Net Collection Card" w="33333" x="0" y="5000">
      <!-- worksheet zone inside -->
    </zone>
  </zone>
</zone>
```

**Naming conventions**:
- Top-level vertical container: `Main Section`
- Horizontal rows: `KPI Row`, `Charts Row`
- Card wrappers around worksheets: `{Metric} Card` (e.g. `Net Collection Card`, `Orders Card`)
- Chart wrappers: `{Chart Name} Container` (e.g. `By Product Container`)
- DZV panel: `Product Drilldown Panel` (or relevant drilldown name)
- DZV children: `Drilldown Header`, `Drilldown KPI Row`, `Drilldown Charts Row`, `Metric Selector`

**Key rules**:
- Only add `friendly-name` to container zones (`layout-flow`), NOT to worksheet zones or text zones
- Requires `ZoneFriendlyName` in the manifest (already in the "always include" list)
- Names should be descriptive and match the content they contain

### Rounded corners (ALWAYS APPLY)

**Rule**: Always apply rounded corners to ALL dashboard zones. Use `corner-radius="12"` on containers and `corner-radius="4"` on worksheet zones. This is mandatory for every generated dashboard.

Requires the manifest entry `_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners` and uses the special element tag `_.fcp.DashboardRoundedCorners.true...format`:

```xml
<!-- Container zones (layout-flow wrappers, DZV panel): radius 12 -->
<zone-style>
  <format attr="border-color" value="#e0e0e0"/>
  <format attr="border-style" value="solid"/>
  <format attr="border-width" value="1"/>
  <_.fcp.DashboardRoundedCorners.true...format attr="corner-radius" value="12"/>
  <format attr="margin" value="6"/>
  <format attr="background-color" value="#ffffff"/>
</zone-style>

<!-- Worksheet zones (BANs, charts, etc.): radius 4 -->
<zone-style>
  <_.fcp.DashboardRoundedCorners.true...format attr="corner-radius" value="4"/>
</zone-style>
```

**Key rules**:
- Add `<_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners/>` to the `<document-format-change-manifest>`
- The element tag is `_.fcp.DashboardRoundedCorners.true...format` (NOT a regular `<format>`)
- Container zones (parent `layout-flow` wrappers, DZV panels): `corner-radius="12"`
- Worksheet zones (BANs, bar charts, drilldown cards): `corner-radius="4"`
- Apply to ALL zones — main dashboard KPIs, charts, DZV panel, DZV child zones

---

## 5e. Dynamic Zone Visibility — end-to-end pattern (VALIDATED)

### Parameters

```xml
<!-- String parameter for Open/Close state -->
<column caption="Open Close" datatype="string" name="[Open Close]"
        param-domain-type="list" role="measure" type="nominal" value='"Close"'>
  <calculation class="tableau" formula='"Close"' />
  <members>
    <member value='"Open"' />
    <member value='"Close"' />
  </members>
</column>

<!-- String parameter for selected value — MUST be param-domain-type="any" -->
<column caption="Selected Product" datatype="string" name="[Selected Product]"
        param-domain-type="any" role="measure" type="nominal" value='""'>
  <calculation class="tableau" formula='""' />
</column>
```

**CRITICAL**: `param-domain-type` valid values: `any`, `list`, `range`. NOT `all` (causes D2E8DA72).
Use `any` when the parameter must accept arbitrary values from parameter actions.

### Calculated fields

```
is_open (boolean): [Parameters].[Open Close] = "Open"
val_open (string): "Open"
val_close (string): "Close"
```

### Source worksheet LOD field

The source worksheet (e.g. "By Product" bar chart) MUST have the trigger calc on its LOD/Detail shelf
with `derivation="None"` (producing `none:` prefix), NOT `derivation="User"` (`usr:`).

```xml
<!-- In datasource-dependencies -->
<column-instance column="[Calculation_XXX]" derivation="None"
                 name="[none:Calculation_XXX:nk]" pivot="key" type="nominal" />

<!-- In pane encodings -->
<encodings>
  <lod column="[ds].[none:Calculation_XXX:nk]" />
</encodings>
```

### Parameter actions

The `source-field` MUST match the column-instance derivation (`none:`, not `usr:`):

```xml
<edit-parameter-action caption="Open Drilldown" name="[Action_Open_XXX]">
  <activation type="on-select" />
  <source dashboard="Dashboard Name" type="sheet" worksheet="By Product" />
  <agg-type type="attr" />
  <clear-option type="do-nothing" value="s:LROOT:" />
  <params>
    <param name="source-field" value="[ds].[none:Calculation_XXX:nk]" />
    <param name="target-parameter" value="[Parameters].[Open Close]" />
  </params>
</edit-parameter-action>
```

### Datagraph — one field node, one visibility node PER zone

Each DZV-controlled zone needs its own `dashboard-zone-visibility-node`. All connect to ONE `single-value-field-node`:

```xml
<datagraph>
  <graph>
    <properties>
      <default-execution-subgraph-guid value="EXEC_GUID" />
    </properties>
    <node-execution-subgraphs>
      <pair execution-subgraph-guid="EXEC_GUID" node-guid="FIELD_NODE_GUID" />
      <pair execution-subgraph-guid="EXEC_GUID" node-guid="VIZ_NODE_1_GUID" />
      <pair execution-subgraph-guid="EXEC_GUID" node-guid="VIZ_NODE_2_GUID" />
      <!-- ... one pair per zone -->
    </node-execution-subgraphs>
    <nodes>
      <single-value-field-node
          fieldname="[ds].[Calculation_is_open]"
          fieldname-input-guid="FI_GUID"
          node-guid="FIELD_NODE_GUID"
          value-output-guid="FO_GUID" />
      <dashboard-zone-visibility-node
          dashboard-identifier="{DASHBOARD_UUID}"
          node-guid="VIZ_NODE_1_GUID"
          visibility-input-guid="VI_1_GUID"
          zone-id="19" />
      <dashboard-zone-visibility-node
          dashboard-identifier="{DASHBOARD_UUID}"
          node-guid="VIZ_NODE_2_GUID"
          visibility-input-guid="VI_2_GUID"
          zone-id="20" />
      <!-- ... one node per zone -->
    </nodes>
    <edges>
      <edge from="FO_GUID" to="VI_1_GUID" />
      <edge from="FO_GUID" to="VI_2_GUID" />
      <!-- ... one edge per zone, all from same FO_GUID -->
    </edges>
    <pin-values />
  </graph>
</datagraph>
```

### Zone attributes

ALL DZV zones (panel container AND every child) get `hidden-by-user="true"` for default hidden state.

### Close button

Always use a **Shape mark with `:filled/x`** as the DZV close button (see §5b2). Never use Text marks for close buttons.

---

## 5f. Parameter control zones on dashboards (VALIDATED)

Parameter controls expose a parameter as a UI widget (dropdown, radio buttons, slider) on the dashboard.

**Zone attributes** — use `type-v2="paramctrl"` (NOT `type="paramctrl"`):

```xml
<zone h="5000" id="28" type-v2="paramctrl"
      param="[Parameters].[Drilldown Metric]"
      mode="compact" custom-title="true"
      w="30000" x="4000" y="42000"
      hidden-by-user="true">
  <formatted-text>
    <run bold="true" fontsize="10">Metric</run>
  </formatted-text>
  <layout-cache type-h="cell" type-w="cell" />
</zone>
```

**Key rules**:
- Must use `type-v2="paramctrl"`, not `type="paramctrl"` — the `type` attribute alone does not render the control
- `param` points to the parameter: `[Parameters].[Parameter Name]`
- `mode` options: `compact` (dropdown), `radiolist` (radio buttons), `slider`, `typein`
- `custom-title="true"` with a `<formatted-text>` child overrides the default title
- For DZV panels, add `hidden-by-user="true"` like all other DZV zones and include in the datagraph

---

## 5g. Measure switcher pattern — parameter-driven metric (VALIDATED)

Use a string parameter with a list of measure names and an IF/ELSE calculated field to let users toggle the measure shown on bar charts.

**Parameter definition** (in Parameters datasource):

```xml
<column caption="Drilldown Metric" datatype="string" name="[Drilldown Metric]"
        param-domain-type="list" role="measure" type="nominal"
        value="&quot;Net Collection&quot;">
  <calculation class="tableau" formula="&quot;Net Collection&quot;" />
  <members>
    <member value="&quot;Net Collection&quot;" />
    <member value="&quot;Orders&quot;" />
  </members>
</column>
```

**Switcher calculated field**:

```
IF [Parameters].[Drilldown Metric] = "Net Collection"
THEN SUM(IF [Is Yesterday] AND [product_name] = [Parameters].[Selected Product]
         THEN [usd_net_total] END)
ELSE COUNTD(IF [Is Yesterday] AND [product_name] = [Parameters].[Selected Product]
            THEN [order_id] END)
END
```

**Dashboard placement**: Place a `type-v2="paramctrl"` zone (§5f) in the drilldown panel so users can toggle the metric. Use `mode="compact"` for dropdown or `mode="radiolist"` for inline radio buttons.

**Key rules**:
- Use `param-domain-type="list"` with explicit `<members>` for predefined options
- The switcher calc should be `datatype="real"` / `type="quantitative"` to work as a measure on bar chart columns
- Use a generic number format (`#,##0`) when the switched measures have different units (dollars vs counts)
- Reference bar charts use the switcher calc as their measure instead of a fixed metric

---

## 6. Filters

- **Relative date**: use continuous date column `[none:Order Date:qk]`. Use `period-type` in generated files (Tableau converts to `period-type-v2` on save); use `include-future='true'`. See [date-filter-dashboard-pattern.md](date-filter-dashboard-pattern.md) and §13.17.
- **Categorical**: `groupfilter function='member'` or `'union'`; include `user:ui-domain='database'`, `user:ui-enumeration='inclusive'`, `user:ui-marker='enumerate'` where applicable.
- **Quantitative range**: `<min>` and `<max>` with `include-values='in-range'`.
- **String values in filters** must use `&quot;` (not literal quotes).

---

## 7. Design principles (summary)

- **Executive dashboards**: Inverted pyramid — KPIs top 15–20%, trends middle ~45%, detail bottom ~30%. Limit to 3–5 KPIs. Z-pattern layout; 1–2 accent colors; orange–blue diverging for colorblind-safe.
- **Operational**: Status bar at top; bullet charts; last-updated timestamps; F-pattern (filters left 15–20%).
- **Typography**: One font family; hierarchy via size/weight (e.g. title 18–22pt bold, BAN 20–28pt, body 9–10pt).
- **Color**: WCAG 4.5:1 contrast for text, 3:1 for graphical elements; never color alone for meaning.

See [dashboard-design-best-practices.md](dashboard-design-best-practices.md) for full guidance.

---

## 8. Programmatic generation approach

- **Tableau Document API** (e.g. `tableaudocumentapi`): can modify connections, add calculated fields, read structure — **cannot create worksheets, dashboards, or layouts from scratch**.
- **Direct XML generation** (ElementTree + Jinja2) is the most powerful approach for creating workbooks from scratch.
- **Workflow**: Build a prototype in Tableau Desktop → save .twb → analyze XML diff → templatize (Jinja2) with variables for datasource, fields, shelves, dashboard layout → generate via Python; validate by opening in Tableau Desktop.
- **TWBX**: ZIP archive containing the .twb and a `Data/` directory (e.g. .hyper, .csv).

---

## 9. Pitfalls checklist (generation)

When generating .twb XML:

1. **Formulas**: Use `&quot;` (and `&lt;`, `&gt;`, `&amp;`, `&#13;&#10;`) — never literal quotes in attribute values.
2. **Zone coordinates**: Proportional 0–100000, not pixels.
3. **Field references**: Fully qualified `[datasource].[column_instance]` on shelves and in filters.
4. **Datasource-dependencies**: Every field used in the view (rows, cols, encodings, filters, slices) must have a corresponding `<column>` and `<column-instance>` in that view’s `<datasource-dependencies>`.
5. **Date filters on dashboard**: Use continuous date `[none:FieldName:qk]` for filter, slices, and dashboard filter zone; see [date-filter-dashboard-pattern.md](date-filter-dashboard-pattern.md).

---

## 10. Cross-references

| Topic | Primary reference |
|-------|-------------------|
| **Calculated fields XML** (minimal column, encoding, parameters, table calcs, LOD, pitfalls) | [calculated-fields-xml-guide.md](calculated-fields-xml-guide.md) |
| Calculated fields, LOD, BAN, dashboard types, YoY, dynamic period, measure/dimension swapper | [calculated-fields-lod-ban-dashboards.md](calculated-fields-lod-ban-dashboards.md) |
| TWB schema (parameters, filters, zones, worksheets) | [twb-comprehensive-reference.md](twb-comprehensive-reference.md) |
| Date filter on dashboard | [date-filter-dashboard-pattern.md](date-filter-dashboard-pattern.md) |
| Published datasource (sqlproxy) | [published-datasource.md](published-datasource.md) |
| Dashboard layout and design | [default-desktop-dashboard-layout.md](default-desktop-dashboard-layout.md), [dashboard-design-best-practices.md](dashboard-design-best-practices.md) |
| Show/Hide and DZV | [dynamic-zone-visibility-show-hide-buttons.md](dynamic-zone-visibility-show-hide-buttons.md) |
| Filter patterns (extract, worksheet, slices) | [kpi-dashboard-template-filters.md](kpi-dashboard-template-filters.md) |

---

## 11. Calculated fields: user-created pattern and BAN reuse (Revenue dashboard)

Learnings from editing a workbook that uses **published datasources** and from comparing a **user-created** calculated field (“Test”) with a programmatically added one.

### 11.1 User-created calculated field pattern (“Test” pattern)

When a calculated field is **created in Tableau Desktop** (user-created) on a workbook that uses a published datasource, Tableau stores it with a **minimal** column format:

- **Column attributes**: Use only `caption`, `datatype`, `name`, `role`, `type`. **Omit** `aggregation`, `default-type`, `pivot`, `layered`, `user-datatype`, `visual-totals` for the column element that contains the formula.
- **Formula location**: The formula **must** live in a **child** element: `<calculation class='tableau' formula='...' />`. Do **not** use `scope-isolation='false'` (or other scope attributes) unless the workbook already uses them for that field.
- **Where it appears**: User-created calcs may appear **only in the layered column section** (the `<column>` list with `layered='true'` on sibling columns), **not** in the connection’s `<calculations>` block or in `<metadata-records>`. When adding a new calculated field programmatically, mirror this pattern so Tableau recognizes it.

**Example (minimal format, like “Test”):**

```xml
<column caption='My Calc' datatype='real' name='[Calculation_0424448426029056]' role='measure' type='quantitative'>
  <calculation class='tableau' formula='SUM([usd_net_total])' />
</column>
```

### 11.2 Self-closing column pitfall

A calculated field defined as a **self-closing** `<column ... />` with **no** inner `<calculation>` has **no formula** in the TWB. Tableau may show “field doesn’t exist” or fail to evaluate it. **Always** include the formula in a child `<calculation>` element (or in the connection’s `<calculations>` if you use that pattern). Prefer the child `<calculation>` for workbook-level calcs to match the user-created pattern.

### 11.3 BAN: prefer existing “% vs previous” calculated field

For a BAN (Big Ass Number) card that shows a main value and a “% vs previous period” line:

- **Prefer reusing an existing** calculated field (e.g. “YOY Growth - collection”) when one exists that matches the intent (period-over-period % change), instead of creating a new custom field.
- In the worksheet’s **`<datasource-dependencies>`**: include the **existing** column definition with its **full** formula and any **`<table-calc>`** child (see below). Do not duplicate the field in the connection `<calculations>` or metadata if it already exists in the datasource column list.
- Update **column-instance**, **encodings** (`<text column='...' />`), and **customized-label** to reference the **existing** field’s instance name (e.g. `[usr:Calculation_14425659014385714:qk]`). Use “vs previous period” (or the existing field’s caption) in the label.

### 11.4 Table calculations in XML

Calculated fields that use **table calculations** (e.g. `LOOKUP(..., -1)` for “previous row” or period-over-period) must include a **`<table-calc>`** child inside the `<calculation>` element:

```xml
<column aggregation='User' caption='YOY Growth - collection' datatype='real' ... name='[Calculation_14425659014385714]' ...>
  <calculation class='tableau' formula='(ZN([Gross Collection]) - LOOKUP(ZN([Gross Collection]), -1)) / ABS(LOOKUP(ZN([Gross Collection]), -1))'>
    <table-calc ordering-type='Rows' />
  </calculation>
</column>
```

Use `ordering-type='Rows'` (or the appropriate ordering) so Tableau applies the table calculation correctly in the view.

## 12. KPI card (BAN) + sparkline layout pattern (Yesterday Sales dashboard)

**Terminology:** "BAN" (Big Ass Number) always means a **KPI card with comparisons** — showing the current value plus arrow, % change, and previous period value. Never implement a BAN as a simple standalone number.

Learnings from creating KPI cards with sparkline trend charts for the Yesterday Sales dashboard. Each KPI uses two worksheets stacked vertically: a KPI worksheet (Text mark with customized-label) and a Trend worksheet (Area mark sparkline).

### 12.1 Arrow calculated field: derivation must be User, not None

Arrow fields that display conditional symbols (datatype='string', type='nominal') are **calculated fields** and must use `derivation='User'` in `<column-instance>`, not `derivation='None'`.

**Correct (working):**
```xml
<column caption='Total Net Collection Arrow' datatype='string'
        name='[Calculation_2602260007]' role='measure' type='nominal'>
  <calculation class='tableau' formula='IF ZN([Calc_A]) &gt; ZN([Calc_B]) THEN "▲"
    ELSEIF ZN([Calc_A]) &lt; ZN([Calc_B]) THEN "▼" ELSE "▶" END' />
</column>
<column-instance column='[Calculation_2602260007]' derivation='User'
                 name='[usr:Calculation_2602260007:nk]' pivot='key' type='nominal' />
```

**Wrong (causes "###" in BAN):**
```xml
<column-instance column='[Calculation_2602260007]' derivation='None'
                 name='[none:Calculation_2602260007:nk]' pivot='key' type='nominal' />
```

Key points:
- The `<column>` must have `role='measure'` (not `role='dimension'`).
- All references (encodings `<text column='...'>`, customized-label CDATA) must use `[usr:...:nk]`.
- Using `None` derivation on a calculated field causes Tableau to fail to resolve the field reference in the customized-label, displaying "###" overflow text.

### 12.2 Customized-label: one field reference per run element

In a BAN's `<customized-label>`, each field reference must be in its **own** `<run>` element. Combining two field references in one `<run>` causes rendering failures.

**Correct (working — split green/red for conditional coloring):**
```xml
<customized-label>
  <formatted-text>
    <run fontcolor='#525252' fontname='Tableau Medium' fontsize='12'>Title Text</run>
    <run>&#xC6;&#10;</run>
    <run bold='true' fontcolor='#161616' fontname='Tableau Semibold' fontsize='22'>
      <![CDATA[<[ds].[usr:CalcValue:qk]>]]></run>
    <run>&#xC6;&#10;</run>
    <run fontcolor='#1ea86c' fontsize='10'>
      <![CDATA[<[ds].[usr:CalcArrowPos:nk]>]]></run>
    <run fontcolor='#1ea86c' fontsize='10'>
      <![CDATA[ <[ds].[usr:CalcPctChangePos:qk]>]]></run>
    <run fontcolor='#ca1325' fontsize='10'>
      <![CDATA[<[ds].[usr:CalcArrowNeg:nk]>]]></run>
    <run fontcolor='#ca1325' fontsize='10'>
      <![CDATA[ <[ds].[usr:CalcPctChangeNeg:qk]>]]></run>
    <run fontcolor='#999999' fontsize='9'>
      <![CDATA[ vs LW <[ds].[usr:CalcLastWeek:qk]>]]></run>
  </formatted-text>
</customized-label>
```

Split positive/negative calcs: `CalcArrowPos` returns `"▲"` when positive (null otherwise); `CalcArrowNeg` returns `"▼"` when negative (null otherwise). Same for `CalcPctChangePos` / `CalcPctChangeNeg`. Null fields are hidden in the label, so only one color renders.

**Wrong (arrow + % change combined in one run):**
```xml
    <run fontcolor='#1ea86c' fontsize='10'>
      <![CDATA[<[ds].[usr:CalcArrowPos:nk]> <[ds].[usr:CalcPctChangePos:qk]>]]></run>
```

Note: `&#xC6;&#10;` is Tableau's line break in customized-labels (the AE character + newline).

### 12.2b `mark-labels-show` is REQUIRED for customized-label rendering (VALIDATED)

Without `<style-rule element="mark">` containing `mark-labels-show="true"`, the `customized-label` template is **loaded** (visible in Tableau's Edit Label dialog) but **not rendered** — the viz falls back to showing raw values from the Text shelf.

**Required style rule in `<table><style>` (NOT inside `<pane><style>`):**
```xml
<style-rule element="mark">
  <format attr="mark-labels-show" value="true" />
  <format attr="mark-labels-cull" value="true" />
</style-rule>
```

**Full validated BAN style block (must include all of these):**
```xml
<style>
  <style-rule element="axis">
    <format attr="stroke-size" value="0" />
    <format attr="line-visibility" value="off" />
  </style-rule>
  <style-rule element="axis-title">
    <format attr="display" value="off" />
  </style-rule>
  <style-rule element="header">
    <format attr="stroke-size" value="0" />
  </style-rule>
  <style-rule element="table">
    <format attr="show-null-value-warning" value="false" />
  </style-rule>
  <style-rule element="gridline">
    <format attr="stroke-size" scope="rows" value="0" />
    <format attr="line-visibility" scope="rows" value="off" />
    <format attr="stroke-size" scope="cols" value="0" />
    <format attr="line-visibility" scope="cols" value="off" />
  </style-rule>
  <style-rule element="zeroline">
    <format attr="stroke-size" scope="rows" value="0" />
    <format attr="line-visibility" scope="rows" value="off" />
    <format attr="stroke-size" scope="cols" value="0" />
    <format attr="line-visibility" scope="cols" value="off" />
  </style-rule>
  <style-rule element="mark">
    <format attr="mark-labels-show" value="true" />
    <format attr="mark-labels-cull" value="true" />
  </style-rule>
  <style-rule element="worksheet">
    <format attr="display-field-labels" scope="cols" value="false" />
    <format attr="display-field-labels" scope="rows" value="false" />
  </style-rule>
</style>
```

**Symptom without this rule:** BAN shows raw stacked values (e.g. "2,022,294\n8,875,270\n8,000,055\n90%") instead of the formatted label with inline text ("Goal:", "Run Rate:", etc.) and mixed font sizes.

### 12.2c Line breaks in customized-label: must use `Æ\n` (VALIDATED)

Bare `\n` newlines in `<run>` elements are treated as **whitespace**, not visual line breaks. Tableau requires the AE character (`Æ`, Unicode U+00C6, XML entity `&#xC6;`) followed by a newline (`&#10;`) as its internal line break marker.

**Correct (working):**
```xml
<run>&#xC6;&#10;</run>
```

In Python: `SE(ft, 'run').text = '\u00c6\n'`

**Wrong (newline ignored, no visual line break):**
```xml
<run fontalignment="0">
</run>
```

In Python: `SE(ft, 'run', {'fontalignment': '0'}).text = '\n'`

### 12.2d Multiple fields on Text shelf override customized-label

When **multiple measures** are on the `<text>` encoding, Tableau uses its default multi-field text rendering (each measure on a new line with its default format) and **ignores the customized-label formatting**. The template still appears in the Edit Label dialog, but the viz shows raw stacked values.

**Correct approach:** Put all measures on the `<text>` encoding so they are available for the label, but **also** include the `mark-labels-show` style rule (§12.2b) so the customized-label actually renders.

### 12.2e BAN label `fontname` and `fontalignment` (VALIDATED)

- Include `fontname` on **all** `<run>` elements in the customized-label. Missing `fontname` can cause Tableau to fall back to a default font that renders differently.
- `fontalignment` values: `0` = left, `1` = center, `2` = right. Controls alignment of each run's text within the label.
- For BAN cards in a grid, **left alignment** (`fontalignment='0'`) is recommended so text doesn't overflow narrow cards.
- **Font sizing guideline:** 18pt for the primary value, 9pt for labels ("Goal:", "Run Rate:"), 10pt for secondary values ("RR vs Goal:"). 22pt overflows cards narrower than ~200px.

**Validated BAN customized-label structure:**
```xml
<customized-label>
  <formatted-text>
    <run bold="true" fontalignment="0" fontcolor="#161616"
         fontname="Tableau Semibold" fontsize="18">
      <![CDATA[<[ds].[usr:PeriodActual:qk]>]]></run>
    <run>&#xC6;&#10;</run>
    <run fontalignment="0" fontcolor="#888888"
         fontname="Tableau Medium" fontsize="9">Goal: </run>
    <run fontalignment="0" fontcolor="#555555"
         fontname="Tableau Medium" fontsize="9">
      <![CDATA[<[ds].[usr:PeriodGoal:qk]>]]></run>
    <run fontalignment="0" fontcolor="#888888"
         fontname="Tableau Medium" fontsize="9">   Run Rate: </run>
    <run fontalignment="0" fontcolor="#555555"
         fontname="Tableau Medium" fontsize="9">
      <![CDATA[<[ds].[usr:PeriodRunRate:qk]>]]></run>
    <run>&#xC6;&#10;</run>
    <run fontalignment="0" fontcolor="#888888"
         fontname="Tableau Medium" fontsize="9">RR vs Goal: </run>
    <run bold="true" fontalignment="0" fontcolor="#333333"
         fontname="Tableau Medium" fontsize="10">
      <![CDATA[<[ds].[usr:RunRateVsGoal:qk]>]]></run>
  </formatted-text>
</customized-label>
```

### 12.3 BAN zone sizing: 92px for 3-line text

A BAN with 3 lines of text (title 12pt + big number 22pt + arrow/change 11pt) requires `fixed-size='92'` on the dashboard zone. With a dashboard height of ~900px, the corresponding zone `h` is `10222` (in Tableau's 100000-based coordinate system).

**Zone sizing (desktop layout):**
```xml
<!-- BAN zone: fixed height 92px for 3-line text -->
<zone fixed-size='92' h='10222' id='7' is-fixed='true'
      name='BAN Total Net Collection' show-title='false'
      w='23834' x='583' y='5778'>
  <layout-cache type-h='cell' type-w='cell' />
</zone>
<!-- Trend zone: fills remaining space -->
<zone h='13444' id='8' name='Trend Total Net Collection'
      show-title='false' w='23834' x='583' y='16000'>
  <layout-cache minheight='130' minwidth='100' type-h='scalable' type-w='scalable' />
</zone>
```

Using `fixed-size='72'` (h='8000') is too small and causes text overflow ("###"). Both the primary layout and device layout zones must match.

### 12.4 Sparkline trend: hide Y-axis header and axis titles

Sparkline trend charts should show only the area chart and mark labels, with no axis titles or Y-axis tick labels. Add these three `<format>` entries inside the `<style-rule element='axis'>`:

```xml
<style-rule element='axis'>
  <format attr='stroke-size' value='0' />
  <format attr='line-visibility' value='off' />
  <!-- Clear Y-axis title (measure name) -->
  <format attr='title' class='0'
          field='[sqlproxy.xxx].[usr:Calculation_xxx:qk]'
          scope='rows' value='' />
  <!-- Clear X-axis title (e.g. "Paid Date [2026]") -->
  <format attr='title' class='0'
          field='[sqlproxy.xxx].[none:paid_date:qk]'
          scope='cols' value='' />
  <!-- Hide Y-axis tick labels (0K, 50K, 100K) -->
  <format attr='display' class='0'
          field='[sqlproxy.xxx].[usr:Calculation_xxx:qk]'
          scope='rows' value='false' />
</style-rule>
```

Without these, Tableau shows the measure name as a rotated Y-axis label ("Net New Colle.."), the date field caption as X-axis title ("Paid Date [2026]"), and Y-axis tick marks (0K, 50K, 100K), consuming space and cluttering the sparkline.

The `field` attribute must reference the exact field used in `<rows>` (for Y-axis) and `<cols>` (for X-axis) of that worksheet. The `class='0'` targets the primary axis.

### 12.5 Percentage fields: use default-format for display formatting

Calculated fields that produce a ratio (e.g. % change) are stored as raw decimals (0.058 not 5.8%). To display them as percentages in the BAN customized-label, add `default-format='p0.0%'` to the `<column>` element:

```xml
<column caption='Total Net Collection % Change' datatype='real'
        default-format='p0.0%' name='[Calculation_2602260005]'
        role='measure' type='quantitative'>
  <calculation class='tableau' formula='(ZN([CalcA]) - ZN([CalcB])) / ABS(ZN([CalcB]))' />
</column>
```

The `default-format` must be set on **every** occurrence of the column -- both in the main datasource `<column>` definition and in each worksheet's `<datasource-dependencies>` `<column>` copy. Without it, the BAN displays the raw decimal (e.g. "0.05803" instead of "5.8%").

Common `default-format` values:
- `p0.0%` -- percentage with one decimal (5.8%)
- `p0%` -- percentage with no decimals (6%)
- `n0` -- integer with no decimals (320,186)
- `n0.0` -- one decimal place (320,186.0)
- `c"$"#,##0;-"$"#,##0` -- currency with dollar sign, no decimals ($320,186). In XML: `default-format='c&quot;$&quot;#,##0;-&quot;$&quot;#,##0'`

### 12.6 Heatmap: interpolated diverging color vs discrete palette (VALIDATED)

For performance heatmaps (e.g. Product × Metric with Run Rate vs Goal), prefer **interpolated diverging color** on the measure directly over a discrete Color Tier calculated field.

**Interpolated approach (recommended):**
- Table-level `<style-rule element="mark">` with two `<encoding>` children:
  - `attr="size-bar"` with `type="centersize"` — fills cells proportionally
  - `attr="color"` with `type="interpolated"`, `palette="red_green_gold_diverging_10_0"`, `min="0.0"`, `max="1.3"`
- Pane color and text encodings both reference the same measure
- Pane mark style: `has-stroke="false"` for cleaner cells, plus full `mark-labels-*` suite
- No need for a separate Color Tier calculated field

**Discrete approach (legacy):**
- Separate `Color Tier` calculated field with CASE logic (Exceeds/Good/OK/Warn/Bad)
- `type="palette"` encoding with `<map>` buckets
- More XML, less flexible gradient

See [visualizations-and-charts.md](visualizations-and-charts.md) §Heat Map for full XML examples.

---

## 13. Critical structural rules for programmatic TWB generation (ARR dashboard)

Learnings from generating an ARR dashboard with direct Databricks connection (`federated`). These rules prevent the most common load errors: **D2E8DA72** (schema/format errors) and **2805CF18** (internal error from malformed structure).

### 13.1 `<windows>` section: never leave empty children

The `<windows>` section at the end of the workbook is structurally critical. Empty child elements cause **Error Code: 2805CF18** (internal error).

**Dashboard window** — must have populated `<viewpoints>` listing every worksheet embedded in the dashboard, plus `<active id="-1" />`:

```xml
<window class="dashboard" maximized="true" name="My Dashboard">
  <viewpoints>
    <viewpoint name="Sheet 1">
      <zoom type="entire-view" />
    </viewpoint>
    <viewpoint name="Sheet 2">
      <zoom type="entire-view" />
    </viewpoint>
  </viewpoints>
  <active id="-1" />
</window>
```

**Worksheet window** — must have a fully populated `<cards>` structure with edges, strips, and card types, plus a `<viewpoint>` with zoom:

```xml
<window class="worksheet" name="Sheet 1">
  <cards>
    <edge name="left">
      <strip size="160">
        <card type="pages" />
        <card type="filters" />
        <card type="marks" />
      </strip>
    </edge>
    <edge name="top">
      <strip size="2147483647">
        <card type="columns" />
      </strip>
      <strip size="2147483647">
        <card type="rows" />
      </strip>
      <strip size="31">
        <card type="title" />
      </strip>
    </edge>
  </cards>
  <viewpoint>
    <zoom type="entire-view" />
  </viewpoint>
</window>
```

**Common mistake:** Using empty `<cards />` and `<viewpoint />` elements causes Tableau to crash with 2805CF18 on open. Always populate the full structure above.

### 13.2 `<table>` element ordering within worksheets (VALIDATED)

The child elements of `<worksheet>` and `<table>` must follow this exact order:

```xml
<worksheet name="My Sheet">
  <layout-options>                     <!-- optional -->
    <title><formatted-text>...</formatted-text></title>
  </layout-options>
  <table>
    <view>
      <datasources>...</datasources>
      <datasource-dependencies>...</datasource-dependencies>
      <!-- filters go here (categorical, quantitative, top) -->
      <shelf-sorts>                    <!-- optional: for bar chart sorting -->
        <shelf-sort-v2 dimension-to-sort="[ds].[none:dim:nk]"
                       direction="DESC" is-on-innermost-dimension="true"
                       measure-to-sort-by="[ds].[usr:calc:qk]" shelf="rows" />
      </shelf-sorts>
      <!-- slices go here -->
      <aggregation value="true" />
    </view>
    <style>...</style>
    <panes>
      <pane selection-relaxation-option="selection-relaxation-allow">
        <view><breakdown value="auto" /></view>
        <mark class="Line" />
        <!-- optional: <encodings>, <customized-label> -->
      </pane>
    </panes>
    <rows>[ds].[field:col:qk]</rows>
    <cols>[ds].[field:col:qk]</cols>
  </table>
  <simple-id uuid="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}" />
</worksheet>
```

**Critical rules:**
- `<rows>` and `<cols>` are **direct children of `<table>`**, placed AFTER `<panes>` — never inside `<view>`.
- `<aggregation value="true" />` must be inside `<view>`.
- `<style>` comes between `</view>` and `<panes>`.
- `<simple-id>` is a **REQUIRED** direct child of `<worksheet>`, placed AFTER `<table>`. Missing it causes D2E8DA72.
- `<shelf-sorts>` goes inside `<view>` AFTER filters and BEFORE slices/aggregation.

### 13.3 Date column type: ordinal column, quantitative instance

For date fields in `<datasource-dependencies>`, the `<column>` element must have `type="ordinal"` (Tableau's default for dates), while the `<column-instance>` has `type="quantitative"` for continuous axis usage:

```xml
<datasource-dependencies datasource="federated.xxx">
  <column datatype="date" name="[date_month]" role="dimension" type="ordinal" />
  <column-instance column="[date_month]" derivation="None"
                   name="[none:date_month:qk]" pivot="key" type="quantitative" />
</datasource-dependencies>
```

**Common mistake:** Setting both column and column-instance to `type="quantitative"`. The column itself describes the data type (ordinal for dates), while the instance describes how the field is used on the shelf (quantitative = continuous axis).

### 13.4 `<layout>` in datasource: include dim-percentage and measure-percentage

The `<layout>` element inside the datasource definition should include `dim-percentage` and `measure-percentage` attributes:

```xml
<layout dim-ordering="alphabetic" dim-percentage="0.5"
        measure-ordering="alphabetic" measure-percentage="0.4"
        show-structure="false" />
```

Missing these attributes can cause schema validation warnings.

### 13.5 `source-build` attribute on workbook root

The `<workbook>` root element must include the `source-build` attribute. Without it, Tableau may reject the file:

```xml
<workbook source-build="2025.3.3 (20253.26.0206.0336)"
          source-platform="mac" version="18.1"
          xmlns:user="http://www.tableausoftware.com/xml/user">
```

### 13.6 `simple-id` elements: omit from `<window>` during generation

Do **not** add `<simple-id uuid="...">` inside `<window>` elements when generating workbooks. Tableau versions that don't declare this element will reject the file with:
- `no declaration found for element 'simple-id'`
- `element 'simple-id' is not allowed for content model`

Tableau Desktop adds `simple-id` to worksheets and windows automatically when saving. It is safe on `<worksheet>` in production workbooks (Tableau adds it), but risky to include manually in `<window>`.

### 13.7 Manifest entries: safe vs unsafe

Only include known-safe manifest entries:

| Entry | Safe? | Notes |
|-------|-------|-------|
| `ObjectModelEncapsulateLegacy` | **Yes** | Always include |
| `enable-sort-zone-taborder` | **No** | Causes D2E8DA72 on older Tableau |

When in doubt, use only `ObjectModelEncapsulateLegacy`. Tableau Desktop will add other manifest entries when saving.

### 13.8 `folders-common`: optional, omit for simplicity

The `<folders-common>` element and `<folder>` children can be omitted entirely when generating programmatically. Tableau will create an ungrouped flat field list. This avoids potential schema issues with folder structure. Add folders only if you need organized field groups in the Data pane and are confident in the schema.

### 13.9 `xmlns:user` namespace with Python ElementTree

When using `xml.etree.ElementTree` to generate TWB files, the `xmlns:user` namespace requires special handling:

```python
USER_NS = 'http://www.tableausoftware.com/xml/user'
ET.register_namespace('user', USER_NS)

# Set user-namespaced attributes via the full namespace URI:
element.set(f'{{{USER_NS}}}ui-domain', 'database')

# After writing, post-process to ensure xmlns:user is on the root:
with open(path, 'r') as f:
    content = f.read()
if 'xmlns:user' not in content:
    content = content.replace(
        '<workbook ',
        "<workbook xmlns:user='http://www.tableausoftware.com/xml/user' ", 1)
    with open(path, 'w') as f:
        f.write(content)
```

**Common mistake:** Setting `xmlns:user` as a regular attribute AND using `register_namespace` causes `duplicate attribute` XML parse errors. Use the post-processing approach above.

### 13.15 Valid style-rule element values

Not all element names are valid in `<style-rule element='...'>`. Using an invalid name causes **Error Code: D2E8DA72** ("value not in enumeration").

**Valid values:**
`axis`, `cell`, `header`, `label`, `mark`, `pane`, `table`, `gridline`, `refline`, `refband`, `axis-title`, `worksheet`

**Invalid (will cause load errors):**
- `zero-line` — not in the enumeration
- `dash-zone-title` — not in the enumeration

To remove gridlines, use `element='gridline'` with `line-visibility='off'`:
```xml
<style-rule element="gridline">
  <format attr="line-visibility" value="off" />
</style-rule>
```

To remove reference lines, use `element='refline'`. There is no separate `zero-line` element — the zero line is controlled by `refline` or axis formatting.

### 13.12 Zone-style must be the LAST child element

In any container zone (layout-basic, layout-flow), the `<zone-style>` element must come **after** all child `<zone>` elements. Placing zone-style before child zones causes **Error Code: D2E8DA72** with content model violations.

**Correct:**
```xml
<zone id="5" param="vert" type-v2="layout-flow">
  <zone id="7" type-v2="filter" ... />
  <zone id="8" type-v2="filter" ... />
  <zone-style>
    <format attr="background-color" value="#F7F8FC" />
  </zone-style>
</zone>
```

**Wrong (zone-style before children):**
```xml
<zone id="5" param="vert" type-v2="layout-flow">
  <zone-style>...</zone-style>
  <zone id="7" ... />
  <zone id="8" ... />
</zone>
```

### 13.13 Filter encoding: use literal quotes with ElementTree

When using Python `xml.etree.ElementTree` to set filter member values, pass **literal double-quote characters** — ET handles XML encoding automatically:

**Correct:**
```python
m.set('member', f'"{val}"')  # ET encodes to &quot;val&quot;
```

**Wrong (double-encoding):**
```python
m.set('member', f'&quot;{val}&quot;')  # ET encodes & again → &amp;quot;
```

This applies to all XML attribute values set via `element.set()`. The same rule applies to formula attributes in `<calculation>` elements — use literal `<`, `>`, `"` characters and let ET handle encoding.

### 13.14 Dashboard filter zones require worksheet name

Filter zones on a dashboard must include a `name` attribute pointing to a worksheet that uses the field. Without `name`, Tableau cannot resolve which worksheet's filter to display:

```xml
<zone type-v2="filter" name="ARR Trend"
      param="[federated.xxx].[none:product_name:nk]"
      mode="checkdropdown" ... />
```

### 13.11 Calculated field formulas: always include aggregation

Calculated fields that reference source columns must wrap them in an aggregation function (SUM, AVG, etc.). Without aggregation, Tableau places the field at row level and the viz shows a single unaggregated value or errors.

**Correct:**
```xml
<calculation class='tableau' formula='SUM([mrr]) * 12' />
```

**Wrong:**
```xml
<calculation class='tableau' formula='[mrr] * 12' />
```

This applies to all calculated fields that reference base measure columns. Tableau Desktop-created calcs always include explicit aggregation.

### 13.10 Minimal generation strategy

For the highest success rate when generating TWB files programmatically:

1. **Omit optional elements** — `metadata-records`, `folders-common`, `semantic-values`, `field-sort-info`. Tableau regenerates these on first open.
2. **Use minimal column definitions in `<datasource-dependencies>`** — only `datatype`, `name`, `role`, `type` (plus `caption` and `default-format` for calculated fields).
3. **Populate all structural elements** — `<cards>` in windows, `<viewpoints>` in dashboard window, `<aggregation value="true" />` in views.
4. **Validate element ordering** — `view` → `style` → `panes` → `rows` → `cols` inside `<table>`.
5. **Use known-safe manifest entries only** — `ObjectModelEncapsulateLegacy`.
6. **Let Tableau Desktop fix up** — Open the generated file; Tableau will add missing metadata, fix formatting, and save a complete file.

### 12.6 BAN text alignment: left-align with fontalignment and cell style

By default, BAN text marks are center-aligned. To left-align the BAN text, two changes are needed:

1. **`fontalignment='0'`** on every `<run>` element in the customized-label (0 = left, 1 = center, 2 = right)
2. **Cell-level `text-align='left'`** inside a `<style>` block within the `<pane>`, after `</customized-label>`

```xml
<pane selection-relaxation-option='selection-relaxation-allow'>
  <view><breakdown value='auto' /></view>
  <mark class='Text' />
  <encodings><!-- text encodings --></encodings>
  <customized-label>
    <formatted-text>
      <run fontalignment='0' fontcolor='#525252' fontname='Tableau Medium' fontsize='12'>Title</run>
      <run fontalignment='0'>&#xC6;&#10;</run>
      <run bold='true' fontalignment='0' fontcolor='#161616' fontname='Tableau Semibold' fontsize='22'>
        <![CDATA[<[ds].[usr:CalcValue:qk]>]]></run>
      <run fontalignment='0'>&#xC6;&#10;</run>
      <run fontalignment='0' fontcolor='#1ea86c' fontsize='10'>
        <![CDATA[<[ds].[usr:CalcArrowPos:nk]>]]></run>
      <run fontalignment='0' fontcolor='#1ea86c' fontsize='10'>
        <![CDATA[ <[ds].[usr:CalcPctChangePos:qk]>]]></run>
      <run fontalignment='0' fontcolor='#ca1325' fontsize='10'>
        <![CDATA[<[ds].[usr:CalcArrowNeg:nk]>]]></run>
      <run fontalignment='0' fontcolor='#ca1325' fontsize='10'>
        <![CDATA[ <[ds].[usr:CalcPctChangeNeg:qk]>]]></run>
      <run fontalignment='0' fontcolor='#999999' fontsize='9'>
        <![CDATA[ vs LW <[ds].[usr:CalcLastWeek:qk]>]]></run>
    </formatted-text>
  </customized-label>
  <style>
    <style-rule element='cell'>
      <format attr='text-align' value='left' />
    </style-rule>
  </style>
</pane>
```

Both are required: `fontalignment='0'` controls the text alignment within the label, and `text-align='left'` controls the cell-level alignment of the mark within the pane.

### 13.16 Relative-date filter must NOT be on a field that is also on cols/rows

A `relative-date` filter on the same date field that appears on the `<cols>` or `<rows>` shelf causes **Error Code: A1E47F55** (Internal Error). Tableau cannot apply a date range filter to a field that is also defining the visual axis.

**Works (date not on shelf):**
- Total ARR worksheet: `relative-date` filter on `[none:date_month:qk]`, `<cols>` is empty
- ARR by Product: `relative-date` filter on `[none:date_month:qk]`, `<cols>` has `[usr:ARR:qk]`

**Fails with A1E47F55 (date on cols AND filtered):**
- ARR Trend: `relative-date` filter on `[none:date_month:qk]`, `<cols>` has `[none:date_month:ok]`

**Workaround:** For worksheets where date is on the axis, use the **dashboard-level date filter** (via filter zone + slices) to restrict the date range, rather than a worksheet-level `relative-date` filter.

### 13.17 Use `period-type` (not `period-type-v2`) and `include-future='true'`

For `<filter class="relative-date">` in programmatically generated TWB files:

1. **Use `period-type`** (not `period-type-v2`). The `period-type-v2` attribute causes **Error Code: D2E8DA72** ("attribute not declared"). Tableau Desktop converts `period-type` → `period-type-v2` internally when saving, which is why saved files show `period-type-v2`, but generated files must use `period-type`.
2. **Use `include-future='true'`**. Setting `include-future='false'` causes **Error Code: A1E47F55** when the relative-date filter is exposed as a dashboard filter zone.

```xml
<filter class="relative-date" column="[ds].[none:date:qk]"
        first-period="-11" last-period="0"
        include-future="true" include-null="false"
        period-type="month" />
```

**Key insight:** When reading a Tableau-saved TWB file, you'll see `period-type-v2`. When *generating* a new TWB, you must use `period-type`. Tableau handles the conversion on first open/save.

### 13.18 Dashboard-level `<datasources>` and `<datasource-dependencies>` cause A1E47F55

Adding `<datasources>` and `<datasource-dependencies>` as direct children of `<dashboard>` causes **Error Code: A1E47F55** in programmatically generated TWBs. The working yesterday_sales_dashboard.twb has only `<size>` and `<zones>` as dashboard children.

**Safe dashboard structure:**
```xml
<dashboard name="My Dashboard">
  <size maxheight="900" maxwidth="1300" minheight="900" minwidth="1300" />
  <zones>
    <!-- layout zones -->
  </zones>
</dashboard>
```

Dashboard filter zones resolve fields through the worksheet they reference (via the `name` attribute), not through dashboard-level deps. Do not add `<datasources>` or `<datasource-dependencies>` to `<dashboard>`.

### 13.19 Date field derivation for month-level display

To display a date field as months on the axis, use `tmn:` (Month-Trunc) derivation on the cols shelf:

| Use case | Column instance name | Derivation | Type |
|----------|---------------------|------------|------|
| Month axis (continuous) | `[tmn:date_month:qk]` | `Month-Trunc` | `quantitative` |
| Month axis (discrete) | `[tmn:date_month:ok]` | `Month-Trunc` | `ordinal` |
| Date filter / slices | `[none:date_month:qk]` | `None` | `quantitative` |

**Important:** Keep `tmn:` only on the cols shelf. Filters, slices, and dashboard filter zones must use `[none:FieldName:qk]` with `derivation='None'`. Include both instances in `datasource-dependencies`.

**Note:** As per rule 13.16, do NOT combine a `tmn:` field on cols with a `relative-date` filter on the same date field — this also causes A1E47F55.

### 13.20 Workaround for date-range filtering on trend worksheets (calculated field)

When a worksheet has a date field on the cols shelf, you cannot use `relative-date` filter (§13.16). The workaround is a **boolean calculated field** that evaluates whether each row falls within the desired date range, then a categorical filter on that field.

**Step 1: Define the calculated field in the datasource**

```xml
<column caption="Last 12 Months" datatype="boolean"
        name="[Calculation_xxx]" role="dimension" type="nominal">
  <calculation class="tableau"
    formula='DATEDIFF("month", [date_month], TODAY()) >= 0 AND DATEDIFF("month", [date_month], TODAY()) <= 11' />
</column>
```

**Step 2: Add to worksheet datasource-dependencies**

```xml
<column caption="Last 12 Months" datatype="boolean"
        name="[Calculation_xxx]" role="dimension" type="nominal" />
<column-instance column="[Calculation_xxx]" derivation="None"
                 name="[none:Calculation_xxx:nk]" pivot="key" type="nominal" />
```

**Step 3: Add categorical filter for `true`**

```xml
<filter class="categorical" column="[ds].[none:Calculation_xxx:nk]">
  <groupfilter function="member" level="[none:Calculation_xxx:nk]" member="true" />
</filter>
```

This approach is safe because the calculated field is a different field from `date_month`, so there's no axis-filter conflict. The filter evaluates at query time using `TODAY()`, so it's always current.

### 13.21 Even distribution of worksheet zones in horizontal containers

For worksheet zones in a horizontal `layout-flow` container to distribute evenly:

1. **Equal proportional `w` values**: Each child zone must have the same `w` value (e.g., two zones in `w=84000` container → each gets `w=42000`)
2. **`layout-cache` with `minwidth`/`minheight`**: Add `minwidth='100'` and `minheight='130'` alongside `type-w='scalable'` and `type-h='scalable'`

```xml
<zone h="28000" id="15" param="horz" type-v2="layout-flow" w="84000">
  <zone id="16" name="Chart A" w="42000" ...>
    <layout-cache minheight="130" minwidth="100" type-h="scalable" type-w="scalable" />
  </zone>
  <zone id="17" name="Chart B" w="42000" ...>
    <layout-cache minheight="130" minwidth="100" type-h="scalable" type-w="scalable" />
  </zone>
</zone>
```

The `x` coordinates should tile: first zone at `x=parentX`, second at `x=parentX + firstW`. The `minwidth`/`minheight` values match the pattern from production dashboards (yesterday_sales_dashboard.twb).

### 13.22 KPI card (BAN) with comparison values (vs Previous Period / vs Last Year)

KPI cards (BANs) always show the current value plus comparisons to previous periods — never just a standalone number. The pattern from `yesterday_sales_dashboard.twb` and `marketing_acquisition_dashboard.twb`:

**Key design rule**: Do NOT use a `relative-date` filter on KPI card worksheets. Embed ALL date filtering inside the calculated field formulas. This allows the card to compute values across multiple time periods simultaneously.

**Step 1: Create calculated fields at datasource level**

Each comparison requires 4 calculated fields (current value uses 1):

```python
# Current period value (formula-filtered, not worksheet-filtered)
'SUM(IF DATEDIFF("month", [date_month], TODAY()) = 0 THEN [mrr] END) * 12'

# Previous period value
'SUM(IF DATEDIFF("month", [date_month], TODAY()) = 1 THEN [mrr] END) * 12'

# Same period last year
'SUM(IF DATEDIFF("month", [date_month], TODAY()) = 12 THEN [mrr] END) * 12'

# Positive % Change (null when not positive — for green coloring)
'IF ZN([current_calc]) >= ZN([comparison_calc])
 THEN (ZN([current_calc]) - ZN([comparison_calc])) / ABS(ZN([comparison_calc]))
 END'

# Negative % Change (null when not negative — for red coloring)
'IF ZN([current_calc]) < ZN([comparison_calc])
 THEN (ZN([current_calc]) - ZN([comparison_calc])) / ABS(ZN([comparison_calc]))
 END'

# Positive arrow (null when not positive)
'IF ZN([current]) > ZN([comparison]) THEN "▲" END'

# Negative arrow (null when not negative)
'IF ZN([current]) < ZN([comparison]) THEN "▼" END'
```

The split positive/negative technique enables conditional coloring: green `#1ea86c` runs for positive fields, red `#ca1325` runs for negative fields. When positive, negative fields are null (hidden in label); when negative, positive fields are null.

**Step 2: Column definitions and instances**

- Value calcs: `datatype='real'`, `role='measure'`, `type='quantitative'`, `derivation='User'`, instance suffix `:qk`
- Positive % calcs: same as values but with `default-format='p0.0%'`
- Negative % calcs: same as values but with `default-format='p0.0%'`
- Positive arrow calcs: `datatype='string'`, `type='nominal'`, `derivation='User'`, instance suffix `:nk`
- Negative arrow calcs: `datatype='string'`, `type='nominal'`, `derivation='User'`, instance suffix `:nk`
- Include base columns used in formulas (e.g., `[mrr]`) in `datasource-dependencies`

**Step 3: Encodings — list ALL fields used in customized-label**

```xml
<encodings>
  <text column="[ds].[usr:current_calc:qk]" />
  <text column="[ds].[usr:pct_change_pos:qk]" />
  <text column="[ds].[usr:pct_change_neg:qk]" />
  <text column="[ds].[usr:comparison_calc:qk]" />
  <text column="[ds].[usr:arrow_pos:nk]" />
  <text column="[ds].[usr:arrow_neg:nk]" />
</encodings>
```

**Step 4: Customized label layout (4-line pattern with split green/red)**

```xml
<customized-label>
  <formatted-text>
    <!-- Line 1: Title -->
    <run fontalignment="0" fontcolor="#525252" fontname="Tableau Medium" fontsize="12">Total ARR</run>
    <run fontalignment="0">Æ&#10;</run>
    <!-- Line 2: Big number -->
    <run bold="true" fontalignment="0" fontcolor="#161616" fontname="Tableau Semibold" fontsize="22"><![CDATA[<[ds].[usr:current:qk]>]]></run>
    <run fontalignment="0">Æ&#10;</run>
    <!-- Line 3: vs Previous Month (green positive, red negative) -->
    <run fontalignment="0" fontcolor="#1ea86c" fontsize="10"><![CDATA[<[ds].[usr:arrow_pm_pos:nk]>]]></run>
    <run fontalignment="0" fontcolor="#1ea86c" fontsize="10"><![CDATA[ <[ds].[usr:pct_pm_pos:qk]>]]></run>
    <run fontalignment="0" fontcolor="#ca1325" fontsize="10"><![CDATA[<[ds].[usr:arrow_pm_neg:nk]>]]></run>
    <run fontalignment="0" fontcolor="#ca1325" fontsize="10"><![CDATA[ <[ds].[usr:pct_pm_neg:qk]>]]></run>
    <run fontalignment="0" fontcolor="#999999" fontsize="9"><![CDATA[ vs PM <[ds].[usr:val_pm:qk]>]]></run>
    <run fontalignment="0">Æ&#10;</run>
    <!-- Line 4: vs Last Year (green positive, red negative) -->
    <run fontalignment="0" fontcolor="#1ea86c" fontsize="10"><![CDATA[<[ds].[usr:arrow_ly_pos:nk]>]]></run>
    <run fontalignment="0" fontcolor="#1ea86c" fontsize="10"><![CDATA[ <[ds].[usr:pct_ly_pos:qk]>]]></run>
    <run fontalignment="0" fontcolor="#ca1325" fontsize="10"><![CDATA[<[ds].[usr:arrow_ly_neg:nk]>]]></run>
    <run fontalignment="0" fontcolor="#ca1325" fontsize="10"><![CDATA[ <[ds].[usr:pct_ly_neg:qk]>]]></run>
    <run fontalignment="0" fontcolor="#999999" fontsize="9"><![CDATA[ vs LY <[ds].[usr:val_ly:qk]>]]></run>
  </formatted-text>
</customized-label>
```

**Required style rules** (same as basic BAN, §13.21):

```xml
<style-rule element="mark">
  <format attr="mark-labels-show" value="true" />
  <format attr="mark-labels-cull" value="true" />
</style-rule>
```

## 14. Custom SQL and direct-connection learnings (One Subscription Usage dashboard)

These rules were discovered while generating a Tableau dashboard with a federated Databricks connection using Custom SQL and BAN worksheets.

### 14.1 Custom SQL: ALL `<` characters are interpreted as parameter markers

Tableau's Custom SQL parser scans for `<...>` patterns to resolve parameter references (e.g. `<Parameters.MyParam>`). This happens **after** XML parsing, so even if `<` is correctly encoded as `&lt;` in XML or wrapped in CDATA, Tableau's SQL parser still sees the decoded `<` and treats it as a parameter marker.

**Affected:** ALL `<` characters including `<` and `<=` comparisons.

**Fix:** Reverse every comparison that uses `<` or `<=`:

| Original | Replacement |
|----------|-------------|
| `a < b` | `b > a` |
| `a <= b` | `b >= a` |
| `date <= add_months(...)` | `add_months(...) >= date` |
| `abs(x) <= 10` | `10 >= abs(x)` |

**Do not rely on CDATA wrapping alone** — CDATA prevents XML parsing issues but does NOT prevent Tableau's Custom SQL parameter scanning. Wrapping the SQL in `<![CDATA[...]]>` is still recommended to avoid XML encoding issues with `&`, `"`, `'`, and `>` characters, but all `<` must be eliminated from the SQL itself.

### 14.2 CDATA for Custom SQL relation text

When embedding large SQL in `<relation type='text'>`, wrap the SQL in `<![CDATA[...]]>`:

```xml
<relation connection='databricks.xxx' name='Custom SQL Query' type='text'>
<![CDATA[
WITH cte AS (
    SELECT * FROM `catalog`.`schema`.`table`
    WHERE date_col >= '2024-01-01'
)
SELECT * FROM cte
]]></relation>
```

Since `xml.etree.ElementTree` doesn't support CDATA natively, use a placeholder in the text and replace it in post-processing:

```python
relation.text = "___SQL_PLACEHOLDER___"
# After generating XML string:
content = content.replace("___SQL_PLACEHOLDER___", f"<![CDATA[{CUSTOM_SQL}]]>")
```

### 14.3 `group-label-config` not allowed in Tableau 2025.3 (18.1)

With `source-build='2025.3.3'`, the element `group-label-config` is **NOT allowed** inside `customized-label`. The correct structure is `formatted-text` as a **direct child** of `customized-label`:

```xml
<!-- CORRECT -->
<customized-label>
  <formatted-text>
    <run ...>Title</run>
    ...
  </formatted-text>
</customized-label>

<!-- WRONG — causes D2E8DA72 -->
<customized-label>
  <group-label-config>
    <formatted-text>...</formatted-text>
  </group-label-config>
</customized-label>
```

**Note:** Older generation scripts (pre-2025.3) may use `group-label-config` successfully. Do not copy that pattern for `source-build='2025.3.3'` workbooks.

### 14.4 `<mark>` NOT allowed inside `<style-rule>` in Tableau 2025.3

With `source-build='2025.3.3'`, `<mark class='...'>` is **NOT allowed** as a child of `<style-rule element='mark'>`. The mark type belongs only in `<pane>`:

```xml
<!-- CORRECT: mark type in pane only -->
<style>
  <style-rule element="mark">
    <format attr="mark-labels-show" value="true" />
  </style-rule>
</style>
<panes>
  <pane ...>
    <mark class="Text" />  <!-- mark type here -->
  </pane>
</panes>

<!-- WRONG — causes D2E8DA72 -->
<style>
  <style-rule element="mark">
    <mark class="Text" />  <!-- NOT allowed here -->
  </style-rule>
</style>
```

### 14.5 BAN label field references: CDATA with full datasource path

In `customized-label`, field references must use `<![CDATA[<[datasource_id].[field_instance]>]]>` syntax — **NOT** `AGG([field])` as plain text.

```xml
<!-- CORRECT: CDATA-wrapped full-path field reference -->
<run bold="true" fontsize="22"><![CDATA[<[federated.xxx].[usr:Calculation_123:qk]>]]></run>

<!-- WRONG: shows literal text "AGG([usr:Calculation_123:qk])" -->
<run bold="true" fontsize="22">AGG([usr:Calculation_123:qk])</run>
```

Since ElementTree doesn't support CDATA, use placeholders and post-process:

```python
_ban_id = 0
def build_ban_worksheet(...):
    global _ban_id
    _ban_id += 1
    placeholder = f"___BAN_FIELD_{_ban_id}___"
    r.text = placeholder
    field_ref = f"[{DS_ID}].[usr:{cname}:qk]"
    return ws, placeholder, field_ref

# In main(), after generating XML string:
for placeholder, field_ref in ban_replacements:
    content = content.replace(placeholder, f"<![CDATA[<{field_ref}>]]>")
```

### 14.6 BAN line breaks: use `Æ&#10;` (not `\n`)

In `customized-label` `<run>` elements, line breaks must use the `Æ` character (U+00C6) followed by `&#10;`:

```xml
<run fontalignment="0">Æ&#10;</run>
```

Plain `\n` does NOT produce a visible line break in the label.

### 14.7 Empty `Parameters` datasource: omit when no parameters exist

Do NOT add an empty `<datasource name="Parameters" />` if the workbook has no parameters. It causes "Errors occurred while trying to load the data source 'Parameters'":

```xml
<!-- WRONG when no parameters exist -->
<datasources>
  <datasource hasconnection="false" inline="true" name="Parameters" version="18.1" />
  <datasource caption="My Data" ...>...</datasource>
</datasources>

<!-- CORRECT when no parameters -->
<datasources>
  <datasource caption="My Data" ...>...</datasource>
</datasources>
```

### 14.8 BAN worksheet style rules (complete set)

For a clean BAN (no visible axes, headers, or titles), include all four style rules:

```xml
<style>
  <style-rule element="axis">
    <format attr="stroke-size" value="0" />
    <format attr="line-visibility" value="off" />
  </style-rule>
  <style-rule element="header">
    <format attr="stroke-size" value="0" />
  </style-rule>
  <style-rule element="mark">
    <format attr="mark-labels-show" value="true" />
    <format attr="mark-labels-cull" value="true" />
  </style-rule>
  <style-rule element="axis-title">
    <format attr="display" value="off" />
  </style-rule>
</style>
```

### 14.9 Tableau formula syntax: use `ISNULL()` not `IS NULL`

Tableau's calculated field language is NOT SQL. `[field] IS NULL` is invalid. Use `ISNULL([field])` instead:

| SQL (Custom SQL, Databricks) | Tableau Calculated Field |
|------------------------------|--------------------------|
| `col IS NULL` | `ISNULL([col])` |
| `col IS NOT NULL` | `NOT ISNULL([col])` |
| `COALESCE(a, b)` | `IFNULL([a], [b])` or `ZN([a])` (for 0) |

Always reference [Tableau Functions](https://help.tableau.com/current/pro/desktop/en-us/functions.htm) for valid syntax.

**Formula formatting:** Format multi-line formulas with each clause on its own line for readability:

```
IF ISNULL([usage_pct_exp_limit])
OR ISNULL([total_credits])
OR [total_credits] = 0
THEN "No Usage"
ELSEIF 0.25 > [usage_pct_exp_limit] THEN "0-25%"
ELSEIF 0.50 > [usage_pct_exp_limit] THEN "25-50%"
ELSE "100%+"
END
```

### 14.10 Calculated field formulas: `<` in XML attributes is safe

Unlike Custom SQL (§14.1), `<` in calculated field formulas stored in XML `formula` attributes IS safe. ElementTree encodes it as `&lt;`, and Tableau's XML parser correctly decodes it back to `<` for the formula engine. However, for defensive coding, reversing comparisons (e.g., `0.25 > [field]` instead of `[field] < 0.25`) avoids any potential issues.

### 14.11 Simple BAN without comparisons (EXCEPTION — not the default)

**Important:** The default BAN is always a **full KPI card with comparisons** (§13.22). Only use this simple BAN pattern when the user explicitly requests no comparisons.

When a simple BAN (no period-over-period comparison) is explicitly requested, the minimal pattern is:

```python
def build_ban_worksheet(name, title_text, calc_key, calc_names, datatype, default_format):
    # View: datasources, datasource-dependencies (calc + filter fields), filters, slices, aggregation
    # Style: axis (hide), header (hide), mark (labels on), axis-title (hide)
    # Panes > Pane: view/breakdown, mark class="Text", encodings (text column), customized-label, cell style
    # Rows (empty), Cols (empty)
    # Label format: Title text + Æ&#10; + CDATA field reference
```

Key differences from full KPI card (§13.22):
- Only 1 encoding field (the measure), not 4+
- Only 2 label runs (title + value), not 7+
- No arrow, % change, or comparison values

## 15. Published datasource connection and parameter learnings (Product Installs dashboard)

These rules were discovered while generating a mixed workbook with a published datasource (`sqlproxy`) and a direct Databricks connection (`federated`) with parameters.

### 15.1 Published datasource `contentUrl` — not exposed by MCP

The Tableau MCP `list-datasources` tool does **NOT** include `contentUrl` in its response. It returns only `id` (LUID), `name`, `description`, `project`, and `tags`. However, the TWB XML requires the `contentUrl` (not LUID, not display name) in both `<repository-location id="...">` and `<connection dbname="...">`.

**The `contentUrl` is NOT the same as the datasource name.** Tableau strips spaces and special characters:
- "Revenue view (Databricks)" → `YourRevenueView`
- "Daily Marketing (Databricks)" → `YourPublishedDatasource`

However, some datasources have auto-appended suffixes when published with name conflicts (e.g., `SitesDatabricks_1xxxx`). You cannot predict these.

**How to find the correct `contentUrl`:**

1. **Best: Use `tableauserverclient`** — `ds.content_url` property returns the exact value
2. **Browser URL** — Navigate to the datasource on Tableau Cloud, the URL segment after `/datasources/` is the contentUrl
3. **MCP wildcard probing** — Use `contentUrl:eq:Name*` filter on `list-datasources` to confirm a datasource exists with that prefix, but this doesn't give the exact value
4. **Existing TWB** — Check a working TWB that connects to the same published datasource

```python
# Using tableauserverclient
with server.auth.sign_in(auth):
    datasources, _ = server.datasources.get()
    for ds in datasources:
        print(f"{ds.name} → contentUrl: {ds.content_url}")
```

**If the `contentUrl` is wrong:** Tableau shows "Datasource with URL XXX could not be found (errorCode=11)" and offers to edit the connection. The user can click "Yes", sign in, and redirect to the correct datasource. Tableau then updates the contentUrl internally.

### 15.2 `luid` is NOT a valid attribute on `repository-location`

Adding `luid="..."` to `<repository-location>` causes **Error Code: D2E8DA72** ("attribute 'luid' is not declared for element 'repository-location'"). The only valid attributes are: `derived-from`, `id`, `path`, `revision`, `site`.

Do NOT try to use the datasource LUID in the TWB XML. Use the `contentUrl` for `id` and `dbname`.

### 15.3 Dimension calculated fields: use `derivation="None"` and `none:` prefix

For calculated fields that are **row-level dimensions** (no aggregation in formula — e.g., `DATETRUNC`, CASE-based dimension switchers, date truncation), the column-instance must use `derivation="None"` and the `none:` prefix. Using `derivation="User"` / `usr:` prefix causes Tableau to treat the field as **AGG** on the shelf.

**Note:** `DATETRUNC()` returns `datetime` in Tableau, so use `datatype="datetime"` for calculated fields that use it (even if the source field is `date`).

**Correct (dimension calc as dimension on shelf):**
```xml
<column caption="Display Date" datatype="datetime" name="[Calculation_xxx]"
        role="dimension" type="quantitative">
  <calculation class="tableau" formula='CASE [Parameters].[Date Granularity]
    WHEN "week" THEN DATETRUNC("week", [run_date])
    WHEN "month" THEN DATETRUNC("month", [run_date])
    ELSE [run_date] END' />
</column>

<!-- Column-instance: derivation="None", prefix "none:" -->
<column-instance column="[Calculation_xxx]" derivation="None"
                 name="[none:Calculation_xxx:qk]" pivot="key" type="quantitative" />

<!-- Shelf reference -->
<cols>[ds].[none:Calculation_xxx:qk]</cols>
```

**Wrong (shows as AGG on shelf):**
```xml
<column-instance column="[Calculation_xxx]" derivation="User"
                 name="[usr:Calculation_xxx:qk]" pivot="key" type="quantitative" />
```

**When to use which derivation for calculated fields:**

| Calc type | Role | Contains AGG? | Derivation | Prefix | Example |
|-----------|------|---------------|------------|--------|---------|
| Measure calc | `measure` | Yes (SUM, etc.) | `User` | `usr:` | `SUM([sales])` |
| Arrow calc | `measure` | Yes (conditional) | `User` | `usr:` | `IF ZN([a]) > ZN([b]) THEN "▲" ...` |
| % Change | `measure` | Yes (references AGG calcs) | `User` | `usr:` | `(ZN([cur]) - ZN([prev])) / ABS(ZN([prev]))` |
| Dimension calc (row-level) | `dimension` | **No** | `None` | `none:` | `DATETRUNC("week", [date])` |
| CASE dimension switcher | `dimension` | **No** | `None` | `none:` | `CASE [param] WHEN "A" THEN [col_a] ...` |

**Implementation pattern (Python):**
```python
if calc["role"] == "dimension":
    derivation, prefix = "None", "none"
else:
    derivation, prefix = "User", "usr"
```

### 15.4 `param-domain-type="list"` parameters: `<members>` only, no `<range>`

For parameters with `param-domain-type="list"`, the `<members>` and `<range>` elements are **mutually exclusive**. Including both causes **Error Code: D2E8DA72** ("element 'members' is not allowed for content model").

```xml
<!-- CORRECT: list parameter with members only -->
<column caption="Date Granularity" datatype="string" name="[Date Granularity]"
        param-domain-type="list" role="measure" type="nominal" value="&quot;week&quot;">
  <calculation class="tableau" formula="&quot;week&quot;" />
  <members>
    <member alias="Day" value="&quot;day&quot;" />
    <member alias="Week" value="&quot;week&quot;" />
    <member alias="Month" value="&quot;month&quot;" />
  </members>
</column>

<!-- WRONG: both members AND range -->
<column ... param-domain-type="list">
  <calculation ... />
  <range granularity="1" max="&quot;year&quot;" min="&quot;day&quot;" />  <!-- NOT allowed with list -->
  <members>...</members>
</column>
```

**Parameter content model:**
- `param-domain-type="list"` → use `<members>` only
- `param-domain-type="range"` → use `<range>` only
- `param-domain-type="any"` → neither `<members>` nor `<range>`

### 15.5 Display Date pattern — parameter-driven date granularity

For dashboards where the user controls the date axis granularity via a parameter, use a **Display Date** calculated field with CASE/DATETRUNC and a companion **parameter**:

**Parameter (in Parameters datasource):**
```xml
<column caption="Date Granularity" datatype="string" name="[Date Granularity]"
        param-domain-type="list" role="measure" type="nominal" value="&quot;week&quot;">
  <calculation class="tableau" formula="&quot;week&quot;" />
  <members>
    <member alias="Day" value="&quot;day&quot;" />
    <member alias="Week" value="&quot;week&quot;" />
    <member alias="Month" value="&quot;month&quot;" />
    <member alias="Quarter" value="&quot;quarter&quot;" />
    <member alias="Year" value="&quot;year&quot;" />
  </members>
</column>
```

**Display Date calc (row-level dimension — uses `none:` on shelf, see §15.3):**
```
CASE [Parameters].[Date Granularity]
WHEN 'week' THEN DATETRUNC('week', [run_date])
WHEN 'month' THEN DATETRUNC('month', [run_date])
WHEN 'quarter' THEN DATETRUNC('quarter', [run_date])
WHEN 'year' THEN DATETRUNC('year', [run_date])
ELSE [run_date]
END
```

**Companion measure calcs (use SUM — placed on rows with `usr:` prefix):**
```
CASE [Parameters].[Date Granularity]
WHEN 'week' THEN SUM([core_domains_last_day_of_week])
WHEN 'month' THEN SUM([core_domains_last_day_of_month])
...
ELSE SUM([core_domains])
END
```

The Display Date is a **dimension** (no aggregation), while the measure calcs contain SUM. Both reference the same parameter but use different derivation prefixes on the shelf.

### 15.6 Measure Names / Measure Values — built-in fields for multi-measure views

`:Measure Names` and `Multiple Values` (aka Measure Values) are **built-in Tableau fields** that are NOT defined in `<datasource-dependencies>`. Tableau creates them implicitly when multiple measures are placed on the view. They can be referenced directly in generated TWB XML.

**Critical naming rules:**
| Concept | Internal name on shelf / filter / encoding | Notes |
|---|---|---|
| Measure Names (dimension) | `[:Measure Names]` | Colon prefix, inside brackets |
| Measure Values (measure) | `[Multiple Values]` | No colon, plain name |

Both are qualified with the datasource name: `[datasource_name].[:Measure Names]` and `[datasource_name].[Multiple Values]`.

**Do NOT use derivation prefixes** like `none::Measure Names:nk` or `none::Measure Values:qk` — these will cause "field does not exist" errors.

**Do NOT define** `[:Measure Names]` or `[Multiple Values]` as `<column>` or `<column-instance>` in `<datasource-dependencies>` — they are implicit.

#### Text-table pattern (Product Installs Table example):

```xml
<view>
  <datasource-dependencies datasource="sqlproxy.xxx">
    <!-- Only the actual measure columns + column-instances; NO Measure Names/Values definitions -->
    <column caption="Pro Active" ... name="[calc_pro]" role="measure" type="quantitative">
      <calculation class="tableau" formula="..." />
    </column>
    <column-instance column="[calc_pro]" derivation="User" name="[usr:calc_pro:qk]" pivot="key" type="quantitative" />
    <!-- ... more measures ... -->
  </datasource-dependencies>

  <!-- Filter: pick which measures appear -->
  <filter class="categorical" column="[sqlproxy.xxx].[:Measure Names]">
    <groupfilter function="union" user:op="manual">
      <groupfilter function="member" level="[:Measure Names]"
                   member="&quot;[sqlproxy.xxx].[usr:calc_pro:qk]&quot;" />
      <!-- ... one per measure ... -->
    </groupfilter>
  </filter>

  <!-- Optional: manual sort order -->
  <manual-sort column="[sqlproxy.xxx].[:Measure Names]" direction="ASC">
    <dictionary>
      <bucket>&quot;[sqlproxy.xxx].[usr:calc_pro:qk]&quot;</bucket>
      <!-- ... one per measure in desired order ... -->
    </dictionary>
  </manual-sort>

  <slices>
    <column>[sqlproxy.xxx].[:Measure Names]</column>
  </slices>
  <aggregation value="true" />
</view>

<style>
  <style-rule element="axis">
    <!-- Hide the Measure Values axis -->
    <format attr="display" class="0" field="[sqlproxy.xxx].[Multiple Values]" scope="cols" value="false" />
  </style-rule>
  <style-rule element="mark">
    <format attr="mark-labels-show" value="true" />
    <format attr="mark-labels-cull" value="true" />
  </style-rule>
</style>

<panes>
  <pane selection-relaxation-option="selection-relaxation-allow">
    <view><breakdown value="auto" /></view>
    <mark class="Bar" />   <!-- or "Text" for a pure text table -->
    <encodings>
      <text column="[sqlproxy.xxx].[Multiple Values]" />
    </encodings>
  </pane>
</panes>

<!-- Rows = Measure Names (one row per measure), Cols = Measure Values (the numbers) -->
<rows>[sqlproxy.xxx].[:Measure Names]</rows>
<cols>[sqlproxy.xxx].[Multiple Values]</cols>
```

**Key takeaways:**
1. `[:Measure Names]` goes on **rows** (or columns) to list measure labels.
2. `[Multiple Values]` goes on the **other axis** and in `<text>` encoding to show values.
3. The filter on `[:Measure Names]` controls which measures appear; `level` is always `[:Measure Names]`, `member` is the fully-qualified column-instance ref in quotes.
4. **`<manual-sort>` is NOT valid in generated TWBs** — causes D2E8DA72 ("no declaration found for element 'manual-sort'"). Tableau Desktop adds it internally on save, but it's rejected on initial load of generated files. The filter member order effectively controls display order.
5. The axis for `[Multiple Values]` can be hidden with a `<style-rule element="axis">` format.
6. The `<filter>` attribute `user:op="manual"` is used (not `user:ui-domain`, etc.) for the Measure Names groupfilter union.

#### Dual-axis chart pattern (Multiple Values + Total calc):

For charts that show component measures (via Multiple Values) alongside a total line (dual axis), the rows shelf uses **parentheses and `+`** syntax:

```xml
<rows>([ds].[Multiple Values] + [ds].[usr:total_calc:qk])</rows>
```

**CRITICAL:** Using a space instead of `(A + B)` causes "Malformed expression: unable to associate operators with operands". Parentheses and `+` are required for dual axis.

Also, `[Multiple Values]` **cannot** be placed alone on `<rows>` or `<cols>` — it only works in the `(A + B)` dual-axis pattern or in `<text>` encodings.

**Three panes** are needed for dual axis:

```xml
<panes>
  <!-- Pane 0: default (no id, no y-axis-name) -->
  <pane selection-relaxation-option="selection-relaxation-allow">
    <view><breakdown value="auto" /></view>
    <mark class="Bar" />  <!-- or "Line" -->
    <encodings>
      <color column="[ds].[:Measure Names]" />
    </encodings>
  </pane>

  <!-- Pane 1: Multiple Values axis -->
  <pane id="1" selection-relaxation-option="selection-relaxation-allow"
        y-axis-name="[ds].[Multiple Values]">
    <view><breakdown value="auto" /></view>
    <mark class="Bar" />
    <encodings>
      <color column="[ds].[:Measure Names]" />
    </encodings>
  </pane>

  <!-- Pane 2: Total calc axis (dual axis line) -->
  <pane id="2" selection-relaxation-option="selection-relaxation-allow"
        y-axis-name="[ds].[usr:total_calc:qk]">
    <view><breakdown value="auto" /></view>
    <mark class="Line" />
    <encodings>
      <color column="[ds].[:Measure Names]" />
    </encodings>
  </pane>
</panes>
```

**Axis styling for dual axis:**

```xml
<style-rule element="axis">
  <!-- Synchronize total axis with Multiple Values -->
  <encoding attr="space" class="0" field="[ds].[usr:total_calc:qk]"
            field-type="quantitative" fold="true" scope="rows"
            synchronized="true" type="space" />
  <!-- Hide total axis (it's synchronized) -->
  <format attr="display" class="0" field="[ds].[usr:total_calc:qk]"
          scope="rows" value="false" />
  <!-- Clear Multiple Values axis title -->
  <format attr="title" class="0" field="[ds].[Multiple Values]"
          scope="rows" value="" />
  <format attr="stroke-size" value="0" />
  <format attr="width" field="[ds].[Multiple Values]" value="52" />
  <format attr="width" field="[ds].[usr:total_calc:qk]" value="52" />
</style-rule>
<!-- Hide pane dividers -->
<style-rule element="table-div">
  <format attr="stroke-size" scope="rows" value="0" />
  <format attr="line-visibility" scope="rows" value="off" />
  <format attr="stroke-size" scope="cols" value="0" />
  <format attr="line-visibility" scope="cols" value="off" />
</style-rule>
```

### 15.6b Color palette for Measure Names — Datasource-level encoding

**Programmatic color assignment for `[:Measure Names]` works at the datasource level** when three prerequisites are met:

1. **`<column-instance>` elements at the datasource level** for every measure that appears in the color legend (both base column Sum derivations and calculated field User derivations)
2. **`<layout dim-ordering='alphabetic' measure-ordering='alphabetic' show-structure='true' />`** at the datasource level
3. **Bucket values must be fully qualified AND wrapped in escaped quotes**: `"[datasource_name].[derivation:column:suffix]"`

**Complete XML pattern** (at the datasource level, after `<column>` definitions):

```xml
<!-- Column-instances for each measure used in color encoding -->
<column-instance column='[new_installs_only_core]' derivation='Sum'
  name='[sum:new_installs_only_core:qk]' pivot='key' type='quantitative' />
<column-instance column='[Calculation_xxx]' derivation='User'
  name='[usr:Calculation_xxx:qk]' pivot='key' type='quantitative' />

<!-- Layout MUST have show-structure='true' -->
<layout dim-ordering='alphabetic' measure-ordering='alphabetic'
  show-structure='true' />

<!-- Color encoding inside datasource <style> -->
<style>
  <style-rule element='mark'>
    <encoding attr='color' field='[:Measure Names]' type='palette'>
      <map to='#7380AB'>
        <bucket>"[federated.xxx].[sum:new_installs_only_core:qk]"</bucket>
      </map>
      <map to='#59504E'>
        <bucket>"[federated.xxx].[usr:Calculation_xxx:qk]"</bucket>
      </map>
    </encoding>
  </style-rule>
</style>
```

**Critical details:**
- The `field` attribute is `[:Measure Names]` (no datasource prefix — we're inside the datasource element)
- Bucket text uses `&quot;` (XML-escaped quotes) wrapping the fully-qualified reference: `"[ds_name].[derivation:column:suffix]"`
- Named `<color-palette>` in `<preferences>` is NOT needed — Tableau Desktop discards them when datasource-level encoding is present
- For single-measure panes (e.g., total line on dual-axis pane 2), also use `mark-color` as backup:

```xml
<pane id='2' ...>
  <style>
    <style-rule element='mark'>
      <format attr='mark-color' value='#59504E' />
    </style-rule>
  </style>
</pane>
```

**Approaches that do NOT work:**

| Approach | Result |
|---|---|
| Encoding at worksheet `<style>` level | Loads but colors not applied |
| `palette` attribute on `<color>` element | Schema error: "attribute not declared" |
| Caption strings as `<bucket>` values | Parse error: "expected '['" |
| Bucket values without datasource prefix | Loads but colors not applied |
| Bucket values without escaped quotes | Loads but colors not applied |
| Missing `<column-instance>` at datasource level | Colors not applied |
| Missing `<layout show-structure='true'>` | Colors not applied |

### 15.7 TWB generation pitfalls — elements valid only in Tableau-saved files

Some XML elements/attributes are written by Tableau Desktop on save but are **rejected when loading a freshly generated TWB**:

| Element/Attribute | Error | Notes |
|---|---|---|
| `<manual-sort>` | D2E8DA72: "no declaration found for element" | Tableau Desktop adds internally; not in schema for generated files |
| `mark-line-pattern` (format attr) | D2E8DA72: "value not in enumeration" | Fails at **both** table-level and pane-level `<style>` during initial TWB loading. Only valid in Tableau Desktop-saved files. Set dashed lines manually in Desktop after opening the generated workbook. |
| `[Multiple Values]` alone on rows/cols | "Malformed expression" | Only works in `(A + B)` dual-axis pattern or `<text>` encodings |
| `<button>` / `<toggle-action>` | D2E8DA72: "no declaration found for element 'button'" | The show/hide toggle button (`type-v2='dashboard-object'` with `<button>`) is NOT valid in generated TWBs. Use the DZV datagraph + parameter approach instead (§15.10). |
| `derivation` on `<column>` | D2E8DA72: "attribute 'derivation' is not declared for element 'column'" | `derivation` is only valid on `<column-instance>`, not `<column>`. |
| `<datagraph>` inside `<dashboard>` | D2E8DA72: "element 'datagraph' is not allowed" | `<datagraph>` must be a **workbook-level** element (direct child of `<workbook>`), placed after `<windows>`. NOT inside `<dashboard>`. |

### 15.8 Dashboard zone styling — margin and padding

Outer padding (`margin`) and inner padding (`padding`) must be applied **directly on the worksheet zone**, NOT on a wrapping `layout-flow` container zone. Tableau ignores margin/padding on container zones.

**Working pattern** (matches ARR dashboard):
```xml
<zone h="15000" id="6" name="Total ARR" show-title="false" w="83333" ...>
  <layout-cache ... />
  <zone-style>
    <format attr="border-color" value="#e0e0e0" />
    <format attr="border-style" value="solid" />
    <format attr="border-width" value="1" />
    <format attr="margin" value="12" />
    <format attr="padding" value="4" />
    <format attr="background-color" value="#ffffff" />
  </zone-style>
</zone>
```

Do NOT wrap worksheet zones in `layout-flow` container zones for styling — put the worksheet zone directly inside the row/column and apply all formatting to it.

### 15.9 Legend subtitle for multi-measure charts — colored ■ symbols

Every worksheet with multiple measures colored by `[:Measure Names]` **must** include a colored-square legend subtitle in the worksheet title. This replaces the default Tableau color legend and keeps the chart self-contained.

**Pattern:** Inside `<layout-options><title><formatted-text>`:
1. Title text `<run>` (fontname `Tableau Medium`, fontsize `11`, fontcolor `#525252`)
2. Line break `<run>Æ&#10;</run>`
3. For each measure in the color legend:
   - Colored square: `<run fontcolor='#HEX' fontsize='9'>■ </run>` — color matches the measure's assigned color
   - Caption: `<run fontcolor='#525252' fontsize='9'>Measure Caption   </run>` — three trailing spaces between items, no trailing spaces on the last item

```xml
<worksheet name='New Domains'>
  <layout-options>
    <title>
      <formatted-text>
        <run fontcolor='#525252' fontname='Tableau Medium' fontsize='11'>New Domains</run>
        <run>Æ&#10;</run>
        <run fontcolor='#7380AB' fontsize='9'>■ </run>
        <run fontcolor='#525252' fontsize='9'>New Installs Only Core   </run>
        <run fontcolor='#B9DDF1' fontsize='9'>■ </run>
        <run fontcolor='#525252' fontsize='9'>New Installs Core And Pro   </run>
        <run fontcolor='#3296ED' fontsize='9'>■ </run>
        <run fontcolor='#525252' fontsize='9'>New Installs Only Pro   </run>
        <run fontcolor='#59504E' fontsize='9'>■ </run>
        <run fontcolor='#525252' fontsize='9'>Total Net New</run>
      </formatted-text>
    </title>
  </layout-options>
  <!-- ... table ... -->
</worksheet>
```

**Python generation pattern:**
```python
legend_items = [
    ("Measure Caption", "#HEX_COLOR"),
    # ... one per measure
]
run_nl = ET.SubElement(ftitle, "run")
run_nl.text = "Æ\n"
for i, (caption, color) in enumerate(legend_items):
    run_sq = ET.SubElement(ftitle, "run", {"fontcolor": color, "fontsize": "9"})
    run_sq.text = "\u25a0 "  # ■
    run_lb = ET.SubElement(ftitle, "run", {
        "fontcolor": "#525252", "fontsize": "9",
    })
    run_lb.text = caption + ("   " if i < len(legend_items) - 1 else "")
```

**When to use:** Any chart that has `<encodings><color column='[ds].[:Measure Names]' /></encodings>` in its panes — including dual-axis charts, stacked bars, and multi-line charts. Single-measure charts (e.g., a single line colored by `mark-color`) do NOT need this.

### 15.10 Dynamic Zone Visibility (DZV) — programmatic implementation (VALIDATED)

DZV enables showing/hiding dashboard zones based on a boolean field value. The implementation requires three parts: (1) a parameter + boolean calc, (2) a floating hidden panel with `paramctrl`, and (3) a workbook-level `<datagraph>`.

**Key constraints discovered through trial-and-error:**
- `<button>` / `<toggle-action>` is NOT valid in generated TWBs (§15.7). Use `paramctrl` + DZV instead.
- `<datagraph>` must be a **workbook-level** element (after `<windows>`, before `</workbook>`). Placing it inside `<dashboard>` causes D2E8DA72.
- `derivation` attribute is NOT valid on `<column>` elements — only on `<column-instance>`.
- ALL zones in the DZV panel (root AND every child) must have `hidden-by-user='true'`.
- Each zone needs its own `dashboard-zone-visibility-node` in the datagraph, all connected to the same boolean field node.

**Step 1: Parameter + Boolean calc**

Add a string parameter to the Parameters datasource:
```xml
<column caption='Show Events' datatype='string' name='[Show Events]'
        param-domain-type='list' role='measure' type='nominal' value='&quot;Hide&quot;'>
  <calculation class='tableau' formula='&quot;Hide&quot;' />
  <members>
    <member alias='Show' value='&quot;Show&quot;' />
    <member alias='Hide' value='&quot;Hide&quot;' />
  </members>
</column>
```

Add a boolean calc to the datasource used by the DZV panel worksheets:
```xml
<column caption='Events Panel Visible' datatype='boolean'
        name='[Calculation_XXXX]' role='measure' type='nominal'>
  <calculation class='tableau' formula="[Parameters].[Show Events] = 'Show'" />
</column>
```

**Step 2: Floating hidden panel (sibling of root `layout-basic` zone)**

The DZV panel must be a **sibling** of the root `layout-basic` zone — a direct child of `<zones>`, NOT nested inside the main dashboard flow. This makes it a floating overlay with absolute coordinates:

```xml
<zones>
  <zone id='2' type-v2='layout-basic' ...>
    <!-- main dashboard content -->
    <zone param='vert' type-v2='layout-flow'>
      <!-- title, KPIs, charts, etc. -->
      <!-- paramctrl zone for the Show Events dropdown -->
      <zone is-fixed='true' fixed-size='28'
            param='[Parameters].[Show Events]' type-v2='paramctrl' />
    </zone>
  </zone>
  <!-- Floating DZV panel — sibling of root, absolute positioning -->
  <zone h='78000' id='17' hidden-by-user='true'
        param='vert' type-v2='layout-flow'
        w='92000' x='4000' y='16000'
        friendly-name='Events Drilldown Panel'>
    <!-- ALL children also get hidden-by-user='true' -->
    <zone hidden-by-user='true' type-v2='text'>...</zone>
    <zone hidden-by-user='true' param='horz' type-v2='layout-flow'>
      <zone hidden-by-user='true' name='Chart 1' />
      <zone hidden-by-user='true' name='Chart 2' />
    </zone>
    <zone-style>
      <format attr='background-color' value='#ffffff' />
      <format attr='border-color' value='#c0c0c0' />
      <format attr='border-style' value='solid' />
      <format attr='border-width' value='2' />
      <format attr='padding' value='12' />
    </zone-style>
  </zone>
</zones>
```

**Step 3: Workbook-level `<datagraph>` (after `<windows>`)**

The `<datagraph>` connects the boolean calc to each hidden zone. It must be a direct child of `<workbook>`, placed after `<windows>`:

```xml
<workbook>
  <!-- ... datasources, worksheets, dashboards, windows ... -->
  <datagraph>
    <graph>
      <properties>
        <default-execution-subgraph-guid value='EXEC-GUID' />
      </properties>
      <node-execution-subgraphs>
        <pair execution-subgraph-guid='EXEC-GUID' node-guid='FIELD-NODE-GUID' />
        <pair execution-subgraph-guid='EXEC-GUID' node-guid='VIZ-NODE-1-GUID' />
        <!-- one pair per node -->
      </node-execution-subgraphs>
      <nodes>
        <single-value-field-node
            fieldname='[datasource_name].[Calculation_XXXX]'
            fieldname-input-guid='FI-GUID'
            node-guid='FIELD-NODE-GUID'
            value-output-guid='VO-GUID' />
        <dashboard-zone-visibility-node
            dashboard-identifier='{DASHBOARD-UUID}'
            node-guid='VIZ-NODE-1-GUID'
            visibility-input-guid='VI-1-GUID'
            zone-id='17' />
        <!-- one per hidden zone (root + all children) -->
      </nodes>
      <edges>
        <edge from='VO-GUID' to='VI-1-GUID' />
        <!-- one edge per visibility node, all from same VO-GUID -->
      </edges>
      <pin-values />
    </graph>
  </datagraph>
</workbook>
```

**Required manifest entries:**
```xml
<DatagraphCoreV1 />
<DatagraphNodeDashboardZoneVisibilityV1 />
<DatagraphNodeSingleValueFieldV1 />
<ZoneVisibilityControl />
```

**GUID generation:** Use `uuid.uuid4()` for all GUIDs (execution-subgraph, node, input/output). The `dashboard-identifier` must match the dashboard's `<simple-id uuid>`.

**Python generation pattern:**
```python
def build_datagraph(dash_uuid, evt_zone_ids):
    vis_calc = EVT_CALCS["evt_panel_visible"]
    fieldname = f"[{EVT_DS_NAME}].[{vis_calc['name']}]"
    datagraph = ET.Element("datagraph")
    graph = ET.SubElement(datagraph, "graph")
    exec_guid = str(uuid.uuid4())
    # ... properties, node-execution-subgraphs ...
    field_node_guid = str(uuid.uuid4())
    field_output_guid = str(uuid.uuid4())
    # single-value-field-node ...
    for zid in evt_zone_ids:
        viz_guid = str(uuid.uuid4())
        viz_input = str(uuid.uuid4())
        # dashboard-zone-visibility-node + edge ...
    return datagraph

# In main():
dash, dash_uuid, evt_zone_ids = build_dashboard()
wb.append(build_windows(sheet_names))
wb.append(build_datagraph(dash_uuid, evt_zone_ids))
```

**Multiple datasources sharing the same Databricks connection:** When adding a second federated datasource (e.g., for DZV drilldown data), use the same connection attributes (`auth-pass`, `v-http-path`, `workgroup-auth-mode="prompt"`) as the primary datasource. Only change `dbname`/`schema` for the target catalog. Use a distinct `named-connection` name but share the same `server` and `httppath`.

**Date filter for DZV worksheets:** Create a separate boolean date filter calc on the DZV datasource (e.g., `DATEDIFF('month', [date_action], TODAY()) >= 0 AND 3 >= DATEDIFF(...)`) and apply it as a filter + slice on each worksheet, same pattern as the main datasource date filter.

### 15.11 Paramctrl zone formatting — compact mode and background styling (VALIDATED)

Parameter control zones should always use `mode='compact'` and include background styling for a polished appearance. These settings must be applied programmatically; Tableau Desktop does not always set them automatically.

**Correct pattern:**
```xml
<zone h='3500' id='6' mode='compact'
      param='[Parameters].[Date Granularity]' type-v2='paramctrl'
      w='25000' x='0' y='0'>
  <zone-style>
    <format attr='border-color' value='#000000' />
    <format attr='border-style' value='none' />
    <format attr='border-width' value='0' />
    <format attr='margin' value='4' />
    <format attr='padding' value='2' />
    <format attr='background-color' value='#f0f3fa' />
  </zone-style>
</zone>
```

**Key rules:**
- Use `mode='compact'` for string list parameters (produces a dropdown control)
- Use `mode='datetime'` for date parameters (produces a date picker)
- Background color should match the dashboard canvas background (e.g. `#f0f3fa`)
- Use `border-style='none'` to hide the border (compact dropdowns have their own border)
- Place multiple paramctrls in a horizontal `layout-flow` Filters Row with `fixed-size='32'`
- The Filters Row should be placed between the title row and the KPI row
- Distribute paramctrl widths equally (e.g. 5 controls at `w='20000'` each = 100000)

**Python generation pattern:**
```python
def _paramctrl_zone(parent, param_name, x="0", w="25000"):
    z = ET.SubElement(parent, "zone", {
        "h": "3500", "id": _zone_id(),
        "mode": "compact",
        "param": f"[{PARAM_DS_NAME}].[{param_name}]",
        "type-v2": "paramctrl",
        "w": w, "x": x, "y": "0",
    })
    zs = ET.SubElement(z, "zone-style")
    ET.SubElement(zs, "format", {"attr": "border-color", "value": "#000000"})
    ET.SubElement(zs, "format", {"attr": "border-style", "value": "none"})
    ET.SubElement(zs, "format", {"attr": "border-width", "value": "0"})
    ET.SubElement(zs, "format", {"attr": "margin", "value": "4"})
    ET.SubElement(zs, "format", {"attr": "padding", "value": "2"})
    ET.SubElement(zs, "format", {"attr": "background-color", "value": "#f0f3fa"})
    return z
```

### 15.12 Parameter-driven date filter — CASE statement with multiple range options (VALIDATED)

For dashboards where the user selects a date range from a list of presets (plus a Custom option with explicit start/end), use a CASE-based boolean calculated field driven by three parameters.

**Parameters (in Parameters datasource):**

1. **Date Parameter** (list): controls which preset range is active
```xml
<column alias='Last 3 Months' caption='Date Parameter' datatype='string'
        name='[Date Parameter]' param-domain-type='list' role='measure'
        type='nominal' value='&quot;Last 3 months&quot;'>
  <calculation class='tableau' formula='&quot;Last 3 months&quot;' />
  <members>
    <member alias='This month' value='&quot;This month&quot;' />
    <member alias='Last month' value='&quot;Last month&quot;' />
    <member alias='Last 3 months' value='&quot;Last 3 months&quot;' />
    <member alias='This year' value='&quot;This year&quot;' />
    <member alias='Last 30 days' value='&quot;Last 30 days&quot;' />
    <member alias='Custom' value='&quot;Custom&quot;' />
  </members>
</column>
```

2. **Start Date** and **End Date** (range): used when Date Parameter = "Custom"
```xml
<column caption='Start Date' datatype='date' name='[Start Date]'
        param-domain-type='range' role='measure' type='quantitative'
        value='#2026-01-01#'>
  <calculation class='tableau' formula='#2026-01-01#' />
  <range max='#2026-12-31#' min='#2020-01-01#' />
</column>
```

**CRITICAL: Do NOT use `granularity` attribute on `<range>`** — `granularity='day'` causes error "value 'day' neither 'false' nor 'true'". Only `max` and `min` are valid attributes for date range parameters.

**Date Filter calculated field (boolean, dimension):**
```
CASE [Parameters].[Date Parameter]
WHEN 'This month' THEN DATETRUNC('month', [run_date]) = DATETRUNC('month', TODAY())
WHEN 'Last month' THEN DATETRUNC('month', [run_date]) = DATETRUNC('month', DATEADD('month', -1, TODAY()))
WHEN 'Last 3 months' THEN DATE([run_date]) >= DATETRUNC('month', DATEADD('month', -3, TODAY()))
    AND DATE([run_date]) <= TODAY()
WHEN 'This year' THEN DATETRUNC('year', [run_date]) = DATETRUNC('year', TODAY())
WHEN 'Last 30 days' THEN DATE([run_date]) >= TODAY() - 30
WHEN 'Custom' THEN DATE([run_date]) >= [Parameters].[Start Date]
    AND DATE([run_date]) <= [Parameters].[End Date]
END
```

**Column definition:**
```python
reg_dir_calc(
    "date_filter", "Date Filter", "boolean", "dimension", "nominal",
    "CASE [Parameters].[Date Parameter]\n"
    "WHEN 'This month' THEN DATETRUNC('month', [run_date]) = DATETRUNC('month', TODAY())\n"
    "WHEN 'Last month' THEN DATETRUNC('month', [run_date]) = DATETRUNC('month', DATEADD('month', -1, TODAY()))\n"
    "WHEN 'Last 3 months' THEN DATE([run_date]) >= DATETRUNC('month', DATEADD('month', -3, TODAY()))\n"
    "    AND DATE([run_date]) <= TODAY()\n"
    "WHEN 'This year' THEN DATETRUNC('year', [run_date]) = DATETRUNC('year', TODAY())\n"
    "WHEN 'Last 30 days' THEN DATE([run_date]) >= TODAY() - 30\n"
    "WHEN 'Custom' THEN DATE([run_date]) >= [Parameters].[Start Date]\n"
    "    AND DATE([run_date]) <= [Parameters].[End Date]\n"
    "END",
)
```

**Applying the filter to worksheets:** Same as §13.20 — boolean calc + categorical filter for `true` + slices entry. Apply to ALL line charts, bar charts, and dual-axis worksheets. BAN worksheets embed date logic in their own formulas and don't need this filter.

**Dashboard filters row:** Place all paramctrls (Date Granularity, Date Parameter, Start Date, End Date, Show Events) in a single horizontal `layout-flow` Filters Row with `fixed-size='32'`.

**Key differences from simple DATEDIFF filter (§13.20):**
- Uses a parameter to let users switch between predefined date ranges
- Supports a "Custom" option with explicit start/end date parameters
- The CASE returns a boolean for each WHEN branch; Tableau evaluates the matching branch
- The `[Parameters].[Start Date]` and `[Parameters].[End Date]` references work cross-datasource like `[Parameters].[Date Granularity]`
- Apply the same CASE pattern to ALL datasources that need date filtering (e.g., both the main direct DS and the events DZV DS), just changing the date field name (`[run_date]` vs `[date_action]`)

---

## 18. Dashboard Zone Styling Rules (VALIDATED)

### 18a. Padding on every card container

Every `layout-flow` container that wraps a worksheet zone MUST include `padding` in its `<zone-style>`. Without padding, the worksheet content touches the card borders.

```xml
<zone-style>
  <format attr="border-color" value="#ebebeb" />
  <format attr="border-style" value="solid" />
  <format attr="border-width" value="1" />
  <_.fcp.DashboardRoundedCorners.true...format attr="corner-radius" value="8" />
  <format attr="margin" value="4" />
  <format attr="padding" value="8" />
  <format attr="background-color" value="#ffffff" />
</zone-style>
```

In Python generators, always include `padding` in the `_card_style` helper:
```python
ET.SubElement(zs, "format", {"attr": "padding", "value": "8"})
```

### 18b. No white font colors

NEVER use `fontcolor="#ffffff"` or any near-white font color in:
- Dashboard title text zones
- Bar chart customized-label runs
- Any worksheet customized-label runs

For dark-background title bars, use a **light background with dark text** instead:
- Title text: `fontcolor="#1a1a1a"`, background: `#f0f0f0`
- Subtitle text: `fontcolor="#666666"`

For bar chart labels, use dark text that contrasts with the bar fill:
- Label text: `fontcolor="#1a1a1a"` (on bars, the label will appear outside the bar or be readable against it)

### 18c. Padding convention: 8 outer, 4 inner

Dashboard card containers use two padding values:
- **Outer (margin)**: `8` — space between the card and its siblings
- **Inner (padding)**: `4` — space between the card border and its content

```xml
<zone-style>
  <format attr="margin" value="8"/>
  <format attr="padding" value="4"/>
</zone-style>
```

Worksheet pane cell styles also use `padding="4"` (inner):
```xml
<pane>
  ...
  <style>
    <style-rule element="cell">
      <format attr="text-align" value="left" />
      <format attr="padding" value="4" />
    </style-rule>
  </style>
</pane>
```

### 18e. Label alignment and display-field-labels in bar charts and text tables

All bar chart and text table worksheets MUST include these style rules:
1. **Hide field labels on rows** — prevents dimension name from showing as a header above values
2. **Left-align labels** — ensures customized-label text is left-justified

```xml
<style>
  ...
  <style-rule element="worksheet">
    <format attr="display-field-labels" scope="rows" value="false"/>
  </style-rule>
  <style-rule element="label">
    <format attr="text-align" value="left"/>
  </style-rule>
</style>
```

### 18d. Column type overrides for date fields

When a Databricks source returns a datetime column that should be treated as date, add an explicit column override in the datasource with `datatype-customized="true"`:

```xml
<column datatype="date" datatype-customized="true"
        name="[registration_date]" role="dimension" type="ordinal" />
```

In Python generators, after the metadata-records, add:
```python
ET.SubElement(ds, "column", {
    "datatype": "date", "datatype-customized": "true",
    "name": "[registration_date]", "role": "dimension", "type": "ordinal",
})
```

This prevents Tableau from defaulting to datetime and requiring manual user override.

---

## 19. Tableau Save Normalization — Superstore Annual Financial Report (VALIDATED)

Learnings from comparing a programmatically generated TWB with the Tableau-saved version. These patterns are auto-applied by Tableau Desktop on first save and should be understood for round-trip compatibility.

### 19a. Dashboard element additions on save

Tableau adds three elements to the dashboard that are not strictly required for initial generation but appear after save:

1. **`<datasources>` + `<datasource-dependencies>` inside `<dashboard>`**: If the dashboard uses a parameter control (`paramctrl` zone), Tableau adds a `<datasources>` reference to the Parameters datasource and a full `<datasource-dependencies>` block declaring the parameter's column, formula, and members. This is auto-generated and does NOT need to be in the programmatic TWB.

2. **`sizing-mode='fixed'`** on `<size>`: Tableau adds this attribute to the dashboard `<size>` element. Programmatic generators should include it for round-trip fidelity:
```xml
<size maxheight='900' maxwidth='1500' minheight='900' minwidth='1500' sizing-mode='fixed' />
```

3. **`<simple-id>` on `<dashboard>`**: Tableau adds a `<simple-id uuid='...'>` as the last child of the `<dashboard>` element, similar to how worksheets require it. Include it in programmatic generation for consistency.

### 19b. `<layout-cache>` on worksheet zones

Tableau populates `<layout-cache>` elements inside every worksheet zone on the dashboard. These control how the zone resizes. Key attributes:

- **BAN (text) worksheets**: `type-h='cell' type-w='cell'` (cell-sized, no scaling)
- **Sparkline/trend worksheets**: `minheight='100' minwidth='100' type-h='scalable' type-w='scalable'` (scale to fill)
- **Bar chart worksheets**: `cell-count-h='N' minwidth='M' non-cell-size-h='91' type-h='cell' type-w='scalable'` where N = number of rows (e.g. 4 for regions, 3 for categories), M = min width
- **Map worksheets**: `type-h='cell' type-w='cell'`

While Tableau auto-generates these on save, including them in programmatic TWBs helps prevent initial layout jumps. Use this pattern:
```python
def _layout_cache(parent, type_h="scalable", type_w="scalable", **extra):
    attrs = {"type-h": type_h, "type-w": type_w}
    attrs.update(extra)
    ET.SubElement(parent, "layout-cache", attrs)
```

### 19c. Windows structure enrichment

Tableau enriches the `<windows>` section significantly on save:

1. **Dashboard window**: Adds `pres-mode='true'` and `source-height='30'`, plus an `<active id='N'>` element indicating the last-selected zone and a `<simple-id>`.

2. **Individual worksheet windows**: Tableau creates a `<window class='worksheet'>` for EACH worksheet in the workbook, each containing:
```xml
<window class='worksheet' name='Sales BAN'>
  <cards>
    <edge name='left'>
      <strip size='160'>
        <card type='pages' />
        <card type='filters' />
        <card type='marks' />
      </strip>
    </edge>
    <edge name='top'>
      <strip size='2147483647'>
        <card type='columns' />
      </strip>
      <strip size='2147483647'>
        <card type='rows' />
      </strip>
      <strip size='31'>
        <card type='title' />
      </strip>
    </edge>
  </cards>
  <viewpoint>
    <zoom type='entire-view' />
  </viewpoint>
  <simple-id uuid='{...}' />
</window>
```

For programmatic generation, it is NOT necessary to include these individual worksheet windows — Tableau auto-creates them. Only the dashboard window entry is needed in the initial TWB.

### 19d. Manifest additions

Tableau may add manifest entries on save. For the Superstore dashboard, it added:
- `ISO8601DefaultCalendarPref` — controls date interpretation

Add this to the "always include" list for future generators.

### 19e. Published datasource metadata embedding

When a TWB connects to a published datasource via `sqlproxy`, Tableau **embeds the full published datasource XML** inside the connection's metadata on save. This includes:

1. A `<cols>` mapping section inside `<connection>` that maps short field names to fully qualified `[sqlproxy].[FieldName]` references
2. Full column definitions with rich attributes (`aggregation`, `default-type`, `layered='true'`, `pivot='key'`, `user-datatype`, `visual-totals='Default'`)
3. Semantic roles (e.g., `semantic-role='[City].[Name]'`, `semantic-role='[Country].[ISO3166_2]'`)
4. An `<object-graph>` with logical table objects and their relationships

These are auto-populated by Tableau when it resolves the published datasource and do NOT need to be in the programmatic TWB. The minimal sqlproxy connection pattern (repository-location + connection + relation) is sufficient.

### 19f. Datasource-dependencies column enrichment

In worksheet `<datasource-dependencies>`, Tableau enriches columns from the published datasource with additional attributes beyond what is needed for programmatic generation:
```xml
<column aggregation='Sum' datatype='real' default-type='quantitative'
        layered='true' name='[Sales]' pivot='key' role='measure'
        type='quantitative' user-datatype='real' visual-totals='Default' />
```

The minimal programmatic form that works is:
```xml
<column datatype='real' name='[Sales]' role='measure' type='quantitative' />
```

Tableau fills in `aggregation`, `default-type`, `layered`, `pivot`, `user-datatype`, and `visual-totals` automatically.

### 19g. Bar chart axis styling — scoped to specific fields

In bar chart worksheets, Tableau saves axis formatting scoped to specific column instances:
```xml
<style-rule element='axis'>
  <format attr='stroke-size' value='0' />
  <format attr='line-visibility' value='off' />
  <format attr='title' class='0'
          field='[ds].[usr:Calculation_XYZ:qk]' scope='rows' value='' />
  <format attr='display' class='0'
          field='[ds].[usr:Calculation_XYZ:qk]' scope='rows' value='false' />
</style-rule>
```

The `field` and `scope` attributes target a specific axis. Use this pattern in programmatic generators to hide specific measure axes while keeping dimension headers visible.

### 19h. Show-title attribute on worksheet zones

Every worksheet zone on the dashboard gets `show-title='false'` to suppress the default sheet title. Always include this attribute in programmatic TWBs:
```xml
<zone name='Sales BAN' show-title='false' ... />
```

Without it, Tableau shows a default "Sheet Name" title above each embedded worksheet.

---

## 20. Navigation Buttons (goto-sheet) — VALIDATED

### 20a. Manifest entries required for buttons

The `<button>` element inside `type-v2='dashboard-object'` zones requires two manifest entries:
```xml
<BasicButtonObject/>
<BasicButtonObjectTextSupport/>
```
Without these, Tableau rejects the entire `<button>` element with "no declaration found for element 'button'" (Error D2E8DA72).

### 20b. Buttons MUST be floating zones

`<button>` is only valid inside `type-v2='dashboard-object'` zones that are **direct children of `<zones>`** (floating zones with absolute x/y positioning). Placing button zones inside `layout-flow` containers causes "element 'button' is not allowed for content model" error.

**Pattern**: Use text zones inside the flow layout as visual labels, then add floating `dashboard-object` button zones at the `<zones>` root level positioned to overlap:
```xml
<zones>
  <zone h="100000" id="2" type-v2="layout-basic" w="100000" x="0" y="0">
    <!-- flow layout with text labels -->
  </zone>
  <!-- Floating button zones (siblings of root layout-basic) -->
  <zone h="3111" id="42" type-v2="dashboard-object" w="9333" x="667" y="6444">
    <button action='tabdoc:goto-sheet window-id=&quot;{TARGET-UUID}&quot;' button-type='text'>
      <button-visual-state>
        <caption>OVERVIEW</caption>
        <button-caption-font-style fontsize='9'/>
        <format attr='background-color' value='#FFFFFF'/>
        <format attr='border-style' value='solid'/>
        <format attr='border-width' value='1'/>
        <format attr='border-color' value='#E6E6E6'/>
      </button-visual-state>
    </button>
  </zone>
</zones>
```

### 20c. Dashboard window content model

Each `<window class='dashboard'>` MUST include `<active id='-1'/>` between `<viewpoints>` and `<simple-id>`. The content model is: `(viewpoints, active, device-preview?, simple-id)`. Missing `<active>` causes "element 'simple-id' is not allowed for content model" error.

---

## 21. Multi-Pane Text Tables (AVG(0) Spacer Pattern) — VALIDATED

### 21a. Shelf expression syntax

Multiple fields on `<rows>` or `<cols>` MUST use the `+` operator with parentheses, NOT space-separated references:
```xml
<!-- CORRECT: nested + expression creates 6 column panes -->
<cols>([ds].[usr:s1:qk] + ([ds].[usr:s2:qk] + ([ds].[usr:s3:qk] + ([ds].[usr:s4:qk] + ([ds].[usr:s5:qk] + [ds].[usr:s6:qk])))))</cols>

<!-- WRONG: space-separated — causes "Malformed expression" error -->
<cols>[ds].[field1:nk] [ds].[field2:nk] [ds].[field3:nk]</cols>
```

### 21b. AVG(0) spacer columns

To create a tabular layout with multiple visual columns, define `AVG(0)` calculated fields as spacers. Each spacer creates one column pane:
```python
for i in range(1, 7):
    reg_calc(f"tbl_spacer_{i}", "AVG(0)", "real", "measure", "quantitative", "AVG(0)")
```

Place them on cols with nested `+` expression. Hide all spacer axes:
```xml
<style-rule element='axis'>
  <format attr='display' class='0' field='[ds].[usr:spacer1:qk]' scope='cols' value='false'/>
  <format attr='display' class='0' field='[ds].[usr:spacer2:qk]' scope='cols' value='false'/>
  <!-- repeat for each spacer -->
</style-rule>
```

### 21c. Pane structure

Each pane corresponds to one spacer and shows data via text encoding:
```xml
<panes>
  <!-- Default pane (leftmost, no x-axis) — usually empty -->
  <pane selection-relaxation-option='selection-relaxation-allow'>
    <view><breakdown value='auto'/></view>
    <mark class='Automatic'/>
  </pane>
  <!-- Data pane 1 -->
  <pane id='1' x-axis-name='[ds].[usr:spacer1:qk]'>
    <view><breakdown value='auto'/></view>
    <mark class='Automatic'/>
    <encodings>
      <text column='[ds].[none:Order ID:nk]'/>
    </encodings>
    <style>
      <style-rule element='mark'>
        <format attr='mark-labels-show' value='true'/>
        <format attr='mark-labels-cull' value='true'/>
        <format attr='mark-transparency' value='0'/>
      </style-rule>
    </style>
  </pane>
  <!-- Repeat for each column -->
</panes>
```

### 21d. `computed-sort` vs `shelf-sorts`

`<computed-sort>` requires additional manifest entries and may not be available in programmatic TWBs. Use `<shelf-sorts>` with `<shelf-sort-v2>` instead — it's always in the allowed content model.

---

## 22. Calculated Field Derivation Rules — VALIDATED

### 22a. User vs Sum derivation

- **`User` derivation** (`[usr:calc:qk]`): Use when the formula **already contains aggregation** (e.g., `SUM(IF ... THEN [Sales] END)`, `SUM([Profit])/SUM([Sales])`). Tableau displays the formula result as-is.
- **`Sum` derivation** (`[sum:calc:qk]`): Use when the formula is **row-level** (e.g., `CASE ... THEN [Sales] END`, `DATEDIFF('day', [Order Date], [Ship Date])`). Tableau wraps it in `SUM()` automatically.

Using `User` derivation on a row-level formula causes errors ("The table structure was corrupted or malformed") because Tableau tries to display one mark per row with no aggregation.

### 22b. Bar chart axis hiding — scope matters

For horizontal bar charts (dimension on rows, measure on cols), hide the **cols** axis (where the measure is), not the rows axis:
```xml
<format attr='display' class='0' field='[ds].[usr:measure:qk]' scope='cols' value='false'/>
```

### 22c. Bar chart mark color

Set bar color at the pane level inside a `style-rule element='mark'`:
```xml
<pane selection-relaxation-option='selection-relaxation-allow'>
  <view><breakdown value='auto'/></view>
  <mark class='Bar'/>
  <style>
    <style-rule element='mark'>
      <format attr='mark-color' value='#D4808A'/>
    </style-rule>
  </style>
</pane>
```
Without this, bars render in Tableau's default blue.

### 22d. Dynamic worksheet titles with parameter references

Use CDATA syntax to embed parameter values in worksheet titles. Place the parameter **first** so titles read naturally (e.g., "Profit by Region" not "Sales by Region — Profit"):
```xml
<layout-options>
  <title>
    <formatted-text>
      <run fontname='Tableau Medium' fontsize='11'><![CDATA[<[Parameters].[Measure Selector]>]]></run>
      <run fontname='Tableau Medium' fontsize='11'> by Region</run>
    </formatted-text>
  </title>
</layout-options>
```
The `<[Parameters].[Param Caption]>` syntax inside CDATA renders the current parameter value at runtime.

---

## 23. Multi-Pane Regional Chart (Bar/GanttBar/Shape) — VALIDATED

### 23a. Multi-pane layout with mixed mark types

A single worksheet can host multiple panes each with a different mark type by using the `+` nested expression in `<cols>` with separate axis fields per pane. Structure:

```xml
<cols>(spacer1 + (bar_measure + (ganttbar_measure + spacer2)))</cols>
```

Each pane references its axis via `x-axis-name` and declares its own mark type:

| Pane | x-axis          | Mark     | Purpose                    |
|------|-----------------|----------|----------------------------|
| 0    | —               | Circle   | Empty anchor               |
| 1    | AVG(0) spacer   | Shape    | YoY arrow + % diff text    |
| 2    | Latest measure  | Bar      | Current period value bar   |
| 3    | Prior measure   | GanttBar | Prior period comparison    |
| 4    | AVG(0) spacer   | Circle   | % share text (invisible)   |

### 23b. Shape encoding — 4 required components

Programmatic shape assignment requires **all four** of these components. Missing any one causes shapes to render as default circles/rectangles:

#### 1. Datasource-level `<column-instance>` (CRITICAL)

The boolean field used for shape differentiation must have a `<column-instance>` at the **datasource level** (after `<column>` definitions, before `<folders-common>`). Without this, Tableau cannot resolve the field reference in the shape encoding and silently falls back to default shapes:

```xml
<datasource ...>
  <!-- column definitions -->
  <column caption='Region Colour' datatype='boolean' name='[calc_id]' role='dimension' type='nominal'>
    <calculation class='tableau' formula='...'/>
  </column>
  
  <!-- REQUIRED: datasource-level column-instance for shape-encoded fields -->
  <column-instance column='[calc_id]' derivation='None'
                   name='[none:calc_id:nk]' pivot='key' type='nominal'/>
  
  <folders-common>...</folders-common>
</datasource>
```

#### 2. Shape encoding in datasource `<style>`

Tableau stores shape-to-boolean mappings in the **datasource's** `<style>` section:

```xml
<style>
  <style-rule element='mark'>
    <encoding attr='shape' field='[none:boolean_calc:nk]' type='shape'>
      <map to='Arrows/1-4.png'>
        <bucket>true</bucket>
      </map>
      <map to='Arrows/1-8.png'>
        <bucket>false</bucket>
      </map>
    </encoding>
  </style-rule>
</style>
```

#### 3. Color palette encoding alongside shape encoding

Add a color palette encoding for the same boolean field in the same `<style-rule>`. Tableau expects both color and shape encodings together:

```xml
<style-rule element='mark'>
  <encoding attr='color' field='[none:boolean_calc:nk]' type='palette'>
    <map to='#C97680'><bucket>true</bucket></map>
    <map to='#999999'><bucket>false</bucket></map>
  </encoding>
  <encoding attr='shape' field='[none:boolean_calc:nk]' type='shape'>
    <!-- ... shape maps ... -->
  </encoding>
</style-rule>
```

#### 4. Embedded shape PNGs in `<external><shapes>`

Embed the actual arrow PNG image files as base64 in the workbook. Embed the **entire** Arrows palette (all `*.png` files from `~/Documents/My Tableau Repository/Shapes/Arrows/`), not just the two referenced shapes:

```xml
<external>
  <shapes>
    <shape name='Arrows/1-1.png'>
      iVBORw0KGgo...base64 data...
    </shape>
    <shape name='Arrows/1-4.png'>
      iVBORw0KGgo...base64 data...
    </shape>
    <!-- ... all Arrows/*.png files ... -->
  </shapes>
</external>
```

Read PNGs from `~/Documents/My Tableau Repository/Shapes/Arrows/` and base64 encode them. Format the base64 data with line breaks (76 chars per line) matching Tableau's style.

#### Shape file reference

- `Arrows/1-4.png` = up arrow (positive)
- `Arrows/1-8.png` = down arrow (negative)
- These are built-in Tableau shapes — do NOT use `Custom Shapes/Arrow-Up.png`

In the pane, reference the default shape and encoding:
```xml
<mark class='Shape'/>
<encodings>
  <color column='[ds].[none:boolean_calc:nk]'/>
  <shape column='[ds].[none:boolean_calc:nk]'/>
  <text column='[ds].[sum:positive_pct:qk]'/>
  <text column='[ds].[sum:negative_pct:qk]'/>
</encodings>
<style>
  <style-rule element='mark'>
    <format attr='shape' value='Arrows/1-4.png'/>
    <format attr='size' value='2.5082871913909912'/>
    <format attr='mark-transparency' value='255'/>
  </style-rule>
</style>
```

### 23c. Synchronized axes for GanttBar comparison

To make Bar (pane 2) and GanttBar (pane 3) share the same scale, add a `synchronized` axis encoding in the style:

```xml
<style-rule element='axis'>
  <encoding attr='space' class='0' field='[ds].[sum:prior_measure:qk]'
            field-type='quantitative' fold='true' scope='cols'
            synchronized='true' type='space'/>
</style-rule>
```

Note: Only apply `synchronized='true'` to the measure that needs synchronization (the GanttBar axis). Do NOT add it to spacer fields — Tableau strips unnecessary space encodings on save.

### 23d. GanttBar mark styling

Use a fixed `mark-color` for the GanttBar comparison bar instead of complex Measure Names color encoding:

```xml
<pane id='3' x-axis-name='[ds].[sum:prior_measure:qk]'>
  <mark class='GanttBar'/>
  <mark-sizing mark-sizing-setting='marks-scaling-off'/>
  <style>
    <style-rule element='mark'>
      <format attr='size' value='0.92254143953323364'/>
      <format attr='mark-color' value='#E6E6E6'/>
      <format attr='mark-labels-show' value='false'/>
    </style-rule>
  </style>
</pane>
```

### 23e. Customized-label with colored positive/negative text

Split YoY % diff into separate positive and negative calcs, then use colored `<run>` elements:

```xml
<customized-label>
  <formatted-text>
    <run fontcolor='#c97680'><![CDATA[<[ds].[sum:positive_pct:qk]>]]></run>
    <run fontcolor='#999999'><![CDATA[<[ds].[sum:negative_pct:qk]>]]></run>
  </formatted-text>
</customized-label>
```

Only one of the two values is non-null per row, so the label shows either the positive value in rose or the negative value in gray.

### 23f. Table-calc column instance (Regional Share %)

For table-calc fields, the column-instance needs a `:1` name suffix and a `<table-calc>` child:

```xml
<!-- In datasource definition -->
<column caption='Regional Share %' ...>
  <calculation class='tableau' formula='SUM([Latest]) / TOTAL(SUM([Latest]))'>
    <table-calc ordering-type='Rows'/>
  </calculation>
</column>

<!-- In worksheet datasource-dependencies -->
<column-instance column='[calc]' derivation='User' name='[usr:calc:qk:1]'
                 pivot='key' type='quantitative'>
  <table-calc ordering-type='Columns'/>
</column-instance>
```

### 23g. LOD calcs with FIXED need Sum derivation in worksheets

LOD calcs like `{ FIXED [Region] : SUM(IF ... THEN [Sales] END) }` return a single value per dimension member. When used on shelves, use `Sum` derivation (`[sum:calc:qk]`). SUM of a FIXED LOD value = the value itself, so it renders correctly.

### 23h. Layout-cache for multi-pane cell-counted zones

Tableau normalizes multi-pane chart zones with:
```xml
<layout-cache cell-count-h='4' has-max-size-w='true' maxwidth='702'
              minwidth='702' non-cell-size-h='36' type-h='cell' type-w='scalable'/>
```
Where `cell-count-h` = number of dimension members (e.g., 4 regions).

### 23i. Boolean color encoding

For bar/shape marks colored by a boolean field, place the boolean field on the color encoding shelf at the **pane level**:
```xml
<encodings>
  <color column='[ds].[none:boolean_calc:nk]'/>
</encodings>
```
Additionally, define the color **palette mapping** at the **datasource level** in the `<style>` section (see 23b, component 3). Both are needed for consistent colors across fresh workbook loads.

### 23j. Undeclared internal attributes to avoid

These attributes appear in Tableau-saved TWBs but are NOT declared in the schema — omit them from programmatic generation:
- `customization-axis` on `<panes>` (e.g., `customization-axis='layer'` for map layers)
- `generated-title` on `<pane>` (e.g., `generated-title='State/Province'`)

Tableau adds them automatically after the first save.

### 23k. Dual-axis sparkline (line + area fill)

Create a sparkline with a line on top and a shaded area behind by placing the **same measure twice** in rows with `+`:

```xml
<rows>([ds].[usr:measure:qk] + [ds].[usr:measure:qk])</rows>
<cols>[ds].[tmn:Order Date:qk]</cols>
```

This creates a dual Y-axis with 3 panes:

| Pane | y-axis-name | y-index | Mark | Purpose |
|------|------------|---------|------|---------|
| 0 | — | — | Automatic | Base (tooltip only) |
| 1 | measure ref | 1 | Automatic | Line on top |
| 2 | measure ref | — | Area | Shaded fill behind |

Key settings:
- **Synchronized axes**: `<encoding attr='space' class='1' ... synchronized='true'/>` on the axis style
- **Both axes hidden**: `display='false'` for class `0` and class `1`
- **Area color**: Set `mark-color` to `#dedede` (light gray) on pane 2
- **No background**: Omit `background-color` on the table style for a clean look
- **Hide date axis**: `display='false'` on the date field to remove header labels
- **Hide all gridlines/zerolines/table-divs**: stroke-size=0, line-visibility=off
- **Suppress null warning**: Add `<format attr='show-null-value-warning' value='false' />` inside `<style-rule element='table'>`
- **Tooltip on every pane**: Each pane should have `<customized-tooltip>` showing date + bold value: `<run><![CDATA[<[ds].[tmn:date:qk]>]]></run><run bold='true'><![CDATA[ | <[ds].[usr:measure:qk]>]]></run>`
- **Mark labels off on line pane**: Pane 1 (line) should have `mark-labels-show='false'` to keep the sparkline clean

**Rule**: Any dual-axis pattern (sparkline, Top 5 badges, etc.) MUST include `synchronized='true'` on the second axis encoding, otherwise Tableau stacks panes vertically instead of overlaying them.

### 23l. Pane child element ordering (strict)

The pane content model enforces this exact sequence:
```
view → mark → mark-sizing? → encodings? → label-data* → dropline? → trendline? → reference-line → customized-tooltip → customized-label → style
```
`customized-tooltip` must appear **before** `customized-label` and **before** `style`. Placing it after `style` causes a D2E8DA72 schema validation error.

### 23k. Generic multi-pane bar function

The multi-pane chart pattern (23a) can be generalized for any dimension (Region, Category, Segment) by:
1. Creating a `_register_dim_calcs(prefix, dim_name)` helper that registers 9 calc fields per dimension (latest LOD, prior LOD, boolean colour, % diff, positive %, negative %, share %, 2 AVG(0) spacers)
2. Each dimension gets its own FIXED LOD expressions: `{ FIXED [Region] : ... }` vs `{ FIXED [Category] : ... }`
3. A single `_multi_pane_bar(dim_name, calc_keys)` function generates the worksheet for any dimension
4. All 3 boolean colour fields need their own datasource-level column-instance, color encoding, and shape encoding

### 23l. Order Details multi-pane table (AVG(0) columns with Square marks)

**Pattern**: Create a data table using AVG(0) spacer columns and Square marks with text labels. Each "column" in the table is a separate pane.

**Key rules**:

1. **Mark type**: Use `Square` (not `Shape`) unless you have custom shape files (e.g., Rounded Rectangle). Shape marks require a `.png` in the Shapes repository; Square marks render natively.
2. **Two-line labels**: Use `<customized-label>` with three `<run>` elements: bold first field → `Æ\n` separator run → gray second field (`fontcolor='#898989'`). The `Æ` (U+00C6) + newline is Tableau's internal line-break representation.
3. **Shared AVG(0) pill for two columns**: To create adjacent columns from one spacer (e.g., Sales + Profit), reference the same spacer twice in the `<cols>` nested `+` expression. The second pane uses `x-index="1"` on the `<pane>` element to target the second occurrence.
4. **Sequential color encoding on marks** (e.g., Sales heatmap): Use `<encoding attr="color" field="..." type="custom-interpolated">` with a child `<color-palette custom="true" name="" type="ordered-sequential">` containing `<color>` stops. Do NOT put `custom` or `palette` attributes on the `<encoding>` element itself — they go on `<color-palette>`.
5. **Positive/Negative color encoding**: Create string calc fields returning `"Positive"` or `"Negative"`, use `<color>` encoding on the pane, and define datasource-level palette mappings with `<bucket>&quot;Positive&quot;</bucket>`.
6. **LOD encoding on every pane**: Add `<lod column="sort_bool_ref"/>` to each pane's encodings to connect the DZV sort boolean field.
7. **Row height**: Set via `<format attr="height" field="[Order ID ref]" value="78"/>` in `style-rule element="cell"`.

### 23m. Number formatting in worksheet style rules

Use `attr="text-format"` (NOT `number-format`) in `<format>` elements within `<style-rule element="cell">`:

```xml
<format attr="text-format" field="[Sales ref]" value='c"$"#,##0;-"$"#,##0'/>
<format attr="text-format" field="[Profit Ratio ref]" value="p0.0%"/>
<format attr="text-format" field="[Order Date ref]" value="*dd MMM yyyy"/>
```

Prefix conventions: `c` = currency, `p` = percentage, `*` = date.

### 23n. Empty zones must use `type-v2="empty"`

Empty spacer zones MUST use `type-v2="empty"` and MUST NOT contain `<formatted-text>`. They should only contain `<zone-style>`:

```xml
<zone type-v2="empty" ...>
  <zone-style>
    <format attr="margin" value="4"/>
  </zone-style>
</zone>
```

Using `type-v2="text"` for empty spacers or adding `<formatted-text>` to an `empty` zone causes schema validation errors.

### 23o. `zone-style` must be the LAST child of flow containers

In `layout-flow` zones, `<zone-style>` MUST appear AFTER all child `<zone>` elements. Placing it before child zones causes `element 'zone' is not allowed for content model` errors. Always add `_zs()` calls after all children are appended.

### 23p. Fit Width for large tables in dashboards

For worksheets with many rows (data tables), use `<zoom type="fit-width"/>` in the dashboard window's `<viewpoint>`:

```xml
<viewpoint name="Orders Table (Sales)">
  <zoom type="fit-width"/>
</viewpoint>
```

Other zoom options: `entire-view` (default for most worksheets), `fit-height`.

### 23q. `paramctrl` zones — no `<formatted-text>` child

Parameter control zones (`type-v2="paramctrl"`) must NOT have `<formatted-text>` as a child. They accept only `<zone-style>`:

```xml
<zone type-v2="paramctrl" param="[Parameters].[My Param]" mode="compact" show-title="false" ...>
  <zone-style>
    <format attr="margin" value="4"/>
  </zone-style>
</zone>
```

---

## 24. KPI Tracking Revamp dashboard — Date granularity and advanced patterns (VALIDATED)

Learnings from generating a KPI Tracking dashboard with direct Databricks connection (`federated`), dark theme, parameter-driven date granularity, combined BAN+sparkline cards, heatmaps, and dual-axis line charts.

### 24.1 BAN Title pattern — alternative to full customized-label

Instead of putting everything in the pane's `<customized-label>`, use the **worksheet Title** for KPI name + big number, and the **mark Label** for the delta only. This keeps each component simpler and avoids overly complex `<run>` sequences.

| Component | Mechanism | Why |
|-----------|-----------|-----|
| KPI name + big number | `<layout-options><title><formatted-text>` | Stable, supports field refs via `<run>` |
| Delta / change % | Mark `Label` via `<encodings><text>` + `<customized-label>` | Simple single-line label |
| Trend sparkline | Separate worksheet (area chart) next to BAN in dashboard | Decoupled, avoids complexity |

```xml
<layout-options>
  <title>
    <formatted-text>
      <run fontcolor="#A0A3B5" fontsize="10">Net Collection</run>
      <run>Æ&#10;</run>
      <run bold="true" fontsize="20"><![CDATA[<[ds].[usr:net_collection_cm:qk]>]]></run>
    </formatted-text>
  </title>
</layout-options>
```

The delta label in `<customized-label>` then only needs the positive/negative split fields and the "vs prior" text — much simpler than a 4-line customized-label.

### 24.2 BAN + Sparkline: Horizontal Card Layout

Each KPI "card" is a horizontal container holding a fixed-width BAN on the left and a scalable sparkline on the right. This creates a compact side-by-side layout (unlike the vertical stacking in §12).

```python
# Row of KPI cards
kpi_row = add_container_zone(main_vert, "horz", ..., fixed_size=160)

for ban_name, spark_name in zip(ban_ws_names, sparkline_ws_names):
    # Each card = horizontal container with border
    card = add_container_zone(kpi_row, "horz", ...)

    # BAN: fixed width on left
    ban_z = add_ws_zone(card, ban_name, ..., fixed_size=191)
    add_zone_style(ban_z, bg_color="#1b1d29", margin="0", padding="0",
                   border_style="none", border_width="0", corner_radius="0")

    # Sparkline: scalable, fills remaining space
    spark_z = add_ws_zone(card, spark_name, ...)
    add_zone_style(spark_z, bg_color="#1b1d29", margin="0", padding="0",
                   border_style="none", border_width="0", corner_radius="0")

    # CRITICAL: zone-style on parent card MUST come AFTER child zones
    add_zone_style(card, border_color="#2e2e2e", border_style="solid",
                   border_width="1", corner_radius="8", margin="4", padding="1")
```

**Key rules:**
- Border and corner-radius styling go on the **parent card container**, not on individual children
- Children have `border_style="none"` to avoid double borders
- The card container uses `layout-flow="horz"` to arrange BAN and sparkline side by side

### 24.3 Dual Axis Patterns — Parentheses vs No Parentheses

Tableau has two distinct dual-axis mechanisms controlled entirely by whether the `+` in `<rows>` is wrapped in parentheses. Both use `synchronized='true'` to align scales.

#### Case A: Blended Axis — same measure twice `(A + A)` → 3 panes (sparkline overlay)

Used for sparklines where you want a line on top of an area fill using the **same measure**. Documented in §12 (Yesterday Sales) and the Superstore Annual Financial Report's Sales Sparkline.

```xml
<rows>([ds].[usr:cy_sales:qk] + [ds].[usr:cy_sales:qk])</rows>
```

| Pane | Attrs | Mark | Purpose |
|------|-------|------|---------|
| 0 | (default) | Automatic | Shared Measure Names encoding |
| 1 | `y-axis-name`, `y-index="1"` | Automatic | Line (mark labels hidden) |
| 2 | `y-axis-name` (no y-index) | Area | Shaded fill behind line (`mark-color="#dedede"`) |

Synchronize class 1 axis, hide both Y-axes, suppress gridlines/zerolines/table-divs. See the SKILL.md sparkline template for the full XML.

#### Case B: True Dual Axis — two different measures `A + B` → 2 panes (multi-metric chart)

Used when two **different** measures share a chart (e.g., Revenue trend + Orders trend). Each gets its own Y-axis scale.

```xml
<rows>[ds].[sum:revenue:qk] + [ds].[sum:orders:qk]</rows>
```

**No parentheses** — this creates a true dual axis with 2 panes, not a blended axis.

| Pane | Attrs | Purpose |
|------|-------|---------|
| 0 (left axis) | (default) | First measure (e.g., Revenue) |
| 1 (right axis) | `id="1"`, `y-axis-name="[ds].[sum:orders:qk]"`, `y-index="1"` | Second measure (e.g., Orders) |

Synchronize + hide the second axis:

```xml
<encoding attr="space" class="1" field="[ds].[sum:orders:qk]"
          field-type="quantitative" fold="true" scope="rows"
          synchronized="true" type="space" />
<format attr="display" class="1" field="[ds].[sum:orders:qk]"
        scope="rows" value="false" />
```

#### Quick Reference

| | Case A: Blended `(A + A)` | Case B: Dual `A + B` |
|---|---|---|
| Measures | Same measure twice | Two different measures |
| Parentheses | Yes | No |
| Panes | 3 | 2 |
| Use case | Sparkline line+area overlay | Multi-metric trend chart |
| `y-index` | On pane 1 only | On pane 1 only |

`class="0"` = left/primary axis, `class="1"` = right/dual axis (in both cases).

### 24.4 Line Chart Axis: Independent Range + Include Zero Off

For line charts, prevent axes from always starting at zero by setting each measure to independent range:

```xml
<encoding attr="space" class="0" field="[ds].[sum:revenue:qk]"
          field-type="quantitative" include-zero="false"
          range-type="independent" scope="rows" type="space" />
<encoding attr="space" class="1" field="[ds].[sum:orders:qk]"
          field-type="quantitative" include-zero="false"
          range-type="independent" scope="rows" type="space" />
```

One `<encoding>` per measure axis. `class="0"` for the first measure, `class="1"` for the second (dual axis). Without `include-zero="false"`, revenue charts with values like 500K–600K waste most of the visual range showing 0–500K.

### 24.5 Heatmap Pattern (AVG(1) dummy, max size, hide headers)

For heatmaps (e.g., orders by day-of-week × hour), use `AVG(1)` as a dummy measure on both rows and columns to ensure uniform cell sizing:

```python
rows = f"[{ds}].[none:order_dow_name:nk] + [{ds}].[avg:1:qk]"
cols = f"[{ds}].[none:order_hour:ok] + [{ds}].[avg:1:qk]"
```

#### Max Mark Size

Set mark `size="1.0"` (maximum) so squares fill the available space:

```xml
<style-rule element="mark">
  <format attr="mark-labels-show" value="true" />
  <format attr="mark-labels-cull" value="true" />
  <format attr="size" value="1.0" />
</style-rule>
```

#### Hide Dummy Axis Headers

The `AVG(1)` axes produce headers that must be hidden. Uncheck "Show Header" on the dummy axis (in Tableau Desktop), or suppress via axis style:

```xml
<style-rule element="axis">
  <format attr="stroke-size" value="0" />
  <format attr="line-visibility" value="off" />
</style-rule>
<style-rule element="header">
  <format attr="stroke-size" value="0" />
</style-rule>
```

Mark type: `Square`. Color, size, and text encodings all on the same measure (e.g., `gross_orders`).

### 24.6 Parameter-Driven Date Granularity (Sunday week start)

A string list parameter drives date truncation across all worksheets. Two calculated fields work together:

#### Parameter definition

```python
add_param_column(params_ds,
    caption="Date Granularity", name="[Parameter 5]",
    datatype="string", role="dimension", typ="nominal",
    value='"month"', formula='"month"',
    domain_type="list",
    members=['"day"', '"week"', '"month"', '"quarter"', '"year"'])
```

#### Calculated Field 1: Date (Granularity) — for axis sorting (DATE type)

```
CASE [Parameters].[Parameter 5]
WHEN "day" THEN DATETRUNC("day", [order_date])
WHEN "week" THEN DATETRUNC("week", [order_date], "sunday")
WHEN "month" THEN DATETRUNC("month", [order_date])
WHEN "quarter" THEN DATETRUNC("quarter", [order_date])
WHEN "year" THEN DATETRUNC("year", [order_date])
END
```

**CRITICAL**: Always pass `"sunday"` as the 3rd argument to `DATETRUNC("week", ...)`. Default is Monday; this project uses Sunday as week start.

#### Calculated Field 2: Order Date (Granularity) — for display labels (STRING type)

Human-readable formatted labels for each granularity level:
- year → `"2026"`
- quarter → `"Q1 2026"`
- month → `"Mar/2026"`
- week → `"Mar 16 - Mar 22, 2026"` (handles cross-month spans)
- day → `"2026-03-22"`

This field goes on the X-axis label or tooltip. The DATE field handles sorting; the STRING field handles display.

### 24.7 Granularity-Aware BAN Calculations (dynamic CM/PM)

Instead of hardcoded `DATEDIFF("month", ...)`, use `DATETRUNC` + `DATEADD` with the granularity parameter for dynamic period comparison:

```
-- Current period (works for any granularity)
DATETRUNC([Parameters].[Parameter 5], [order_date]) =
  DATEADD([Parameters].[Parameter 5], 0,
    DATETRUNC([Parameters].[Parameter 5], TODAY()))

-- Prior period
DATETRUNC([Parameters].[Parameter 5], [order_date]) =
  DATEADD([Parameters].[Parameter 5], -1,
    DATETRUNC([Parameters].[Parameter 5], TODAY()))
```

The BAN then shows "current day vs prior day" when granularity=day, "current month vs prior month" when granularity=month, etc. — all from the same calculated field.

### 24.8 Contextual Calculated Field Naming

Use meaningful names instead of random `Calculation_XXXXXXXXXXXXXXXXXXX` IDs. This makes the Tableau Data pane readable and debugging much easier:

```python
_calc_counter = {}
def calc_id(label="calc"):
    safe = label.lower().replace(" ", "_").replace("%", "pct")
    _calc_counter[safe] = _calc_counter.get(safe, 0) + 1
    if _calc_counter[safe] > 1:
        return f"{safe}_{_calc_counter[safe]}"
    return safe
```

Examples: `net_collection_cm`, `aov_pct_pm_neg`, `net_collection_sparkline_last_point`, `vs_prior_label`.

**Note**: The CDATA post-processing regex (§24.9) must accommodate these names — use `[a-zA-Z_]+` (not just digits) in the pattern.

### 24.9 CDATA Post-Processing Regex for ElementTree

Python's `ElementTree` escapes `<>` to `&lt;&gt;`, but Tableau requires `<[field_ref]>` in titles/labels to be inside CDATA blocks. Post-process the XML string after `ET.tostring()`:

```python
pattern = (
    r'(<run[^>]*>)'
    r'([^<]*?'
    r'&lt;\[federated\.[^\]]+\]\.\[[a-zA-Z_]+:[^\]]+\]&gt;'
    r')'
    r'(</run>)'
)
def replacer(m):
    content = m.group(2).replace('&lt;', '<').replace('&gt;', '>')
    content = content.replace('&amp;', '&')
    return f'{m.group(1)}<![CDATA[{content}]]>{m.group(3)}'

xml_str = re.sub(pattern, replacer, xml_str)
```

**Critical rules:**
- Wrap the ENTIRE `<run>` text content in ONE CDATA block. Mixed regular-text + CDATA in the same `<run>` crashes Tableau.
- The regex `[a-zA-Z_]+` (not `[a-z]+`) matches contextual calc names like `net_collection_cm` alongside `sum:`, `usr:`.
- Also handle `[Parameters].[...]` references with a separate regex pass.

### 24.10 Datasource Element Ordering (column before layout/style)

Tableau's datasource schema requires elements in strict order:

```
connection → column* → column-instance* → layout → style → datasource-dependencies*
```

**ALL** `<column>` elements (including calculated fields added dynamically) MUST be appended to the datasource BEFORE `<layout>` and `<style>`. Adding columns after layout/style causes **D2E8DA72**: "element 'column' is not allowed for content model".

**Rule**: Define all calc fields first, then finalize the datasource (add layout + style) as the very last step.

### 24.11 zone-style Must Come After Child Zones in Containers

In `layout-flow` container zones, `<zone-style>` MUST appear AFTER all child `<zone>` elements. This is the same rule as §23o but bears repeating because it causes silent crashes:

```python
# WRONG — style before children
card = add_container_zone(parent, "horz", ...)
add_zone_style(card, ...)            # <zone-style> first → D2E8DA72
add_ws_zone(card, "Sheet 1", ...)
add_ws_zone(card, "Sheet 2", ...)

# CORRECT — style after children
card = add_container_zone(parent, "horz", ...)
add_ws_zone(card, "Sheet 1", ...)
add_ws_zone(card, "Sheet 2", ...)
add_zone_style(card, ...)            # <zone-style> last → works
```

### 24.12 Column Instance Bracket Rule (prevent double brackets)

Store field reference tokens WITHOUT brackets in variables. Add brackets only at point of use. This prevents the common `[[...]]` double-bracket error ("Invalid expression: mismatched [...]"):

```python
# CORRECT: variable stores WITHOUT brackets
date_inst = f"usr:{date_col}:qk"

# Usage adds brackets exactly once
ci.set("name", f"[{date_inst}]")                    # → [usr:x:qk]
cols_text = f"[{ds_id}].[{date_inst}]"              # → [ds].[usr:x:qk]

# WRONG: variable stores WITH brackets → double brackets downstream
date_inst = f"[usr:{date_col}:qk]"
cols_text = f"[{ds_id}].[{date_inst}]"              # → [ds].[[usr:x:qk]] 💥
```

### 24.13 Valid Format Attributes — Quick Reference (VALIDATED)

Tableau validates `<format attr="...">` against an enumeration. Using invalid names causes **D2E8DA72**. Always verify against a working `.twb` before using an attribute.

| Element | Valid attrs | INVALID (crash) |
|---------|------------|-----------------|
| `axis` | `stroke-size`, `line-visibility`, `display`, `color`, `font-size`, `title` | |
| `axis-title` | `display` | |
| `header` | `stroke-size`, `width`, `color`, `font-weight` | `show-header`, `display` |
| `mark` | `mark-color`, `mark-transparency`, `mark-labels-show`, `mark-labels-cull`, `size` | `mark-size` |
| `table` | `show-null-value-warning` | `show-null-indicators` |
| `gridline` / `zeroline` / `table-div` | `line-visibility` | |
| `worksheet` | `background-color`, `display-field-labels` | |
| `field-labels` | `display` (with `scope`) | |
| `refline` | (none commonly used) | `show-null-indicators` |

---

## §25 Superstore Executive Overview — Learnings (2026-03)

Learnings from programmatically generating a 40-worksheet Superstore Performance Dashboard with Excel direct connection, parameter actions, DZV drilldown, colored YoY arrows, and full BAN/sparkline layout.

### 25.1 edit-parameter-action Name Must Use Brackets

The `name` attribute on `<edit-parameter-action>` must be wrapped in brackets matching the regex `\[...\]`. Without brackets, Tableau rejects with "value does not match regular expression facet."

```xml
<!-- WRONG — causes D2E8DA72 -->
<edit-parameter-action name="Set Sales" caption="Set Sales">

<!-- CORRECT -->
<edit-parameter-action name="[Set Sales]" caption="Set Sales">
```

### 25.2 devicelayout Must Have Valid Name, No auto-generated

The `<devicelayout>` element requires a valid `name` attribute (e.g., `"Phone"`). The `auto-generated` attribute is NOT declared in the schema and causes D2E8DA72.

```xml
<!-- WRONG -->
<devicelayout auto-generated="true" name="">
<!-- CORRECT -->
<devicelayout name="Phone">
```

### 25.3 Dashboard simple-id UUID Needs Curly Braces

The `uuid` attribute on a dashboard's `<simple-id>` must be wrapped in curly braces `{...}`. Without them, Tableau rejects with "does not match regular expression facet."

```xml
<!-- WRONG -->
<simple-id uuid="a4d745c7-546c-42a7-98ea-4e81330b34e0" />
<!-- CORRECT -->
<simple-id uuid="{a4d745c7-546c-42a7-98ea-4e81330b34e0}" />
```

### 25.4 Parameter String Values — Avoid Double Encoding

When setting string parameter values programmatically with `xml.etree.ElementTree`, set the value as `'"Sales"'` (Python string containing literal quotes). Do NOT use `'&quot;Sales&quot;'` — the XML library auto-encodes, causing double-encoding (`&amp;quot;`) which Tableau reads as boolean, producing "value neither 'false' nor 'true'."

### 25.5 Join Expressions Use Relation name, Not table

In `<clause>` join expressions, reference the `name` attribute of the `<relation>` element, not the `table` attribute (which often has a `$` suffix for Excel sheets).

```xml
<!-- WRONG — uses table="Orders$" -->
<expression op="[Orders$].[Order ID]" />
<!-- CORRECT — uses name="Orders" -->
<expression op="[Orders].[Order ID]" />
```

### 25.6 Inline Cross-Referenced Calculated Fields

When generating TWBs, calculated fields that reference OTHER calculated fields by caption (e.g., `[Is CY]`) may fail to resolve. **Inline all dependent formulas** directly instead of using cross-references.

```python
# WRONG — Tableau may not resolve [Is CY]
def_calc("cy_sales", "CY Sales", 'IF [Is CY] THEN [Sales] END')

# CORRECT — fully inlined
def_calc("cy_sales", "CY Sales",
    'IF YEAR([Order Date]) = [Parameters].[Year] THEN [Sales] END')
```

### 25.7 border-radius Is NOT a Valid Format Attribute

`border-radius` is NOT in the Tableau format attribute enumeration. Attempting to use it causes D2E8DA72. Enable rounded corners via manifest entry instead:

```xml
<!-- In document-format-change-manifest: -->
<_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners />
```

### 25.8 Hiding Worksheet Titles in Dashboard Zones

Add `show-title="false"` directly on the worksheet `<zone>` element in the dashboard. Removing the title `<strip>` from the `<window>` cards is NOT sufficient — it only affects standalone worksheet views, not dashboard zones.

```xml
<!-- Dashboard zone with title hidden -->
<zone h="20000" id="8" name="SALES BAN" show-title="false" w="12000" x="0" y="0" />
```

### 25.9 Hiding Field Labels (Column/Row Headers) — VALIDATED

The `style-rule element="label"` approach does NOT work for hiding field labels. Use **both** of these style-rules together (learned from Tableau Desktop save):

```xml
<style>
  <!-- Approach 1: field-labels element with display off -->
  <style-rule element="field-labels">
    <format attr="display" scope="cols" value="off" />
    <format attr="display" scope="rows" value="off" />
  </style-rule>
  
  <!-- Approach 2 (REQUIRED): worksheet element with display-field-labels -->
  <style-rule element="worksheet">
    <format attr="display-field-labels" scope="cols" value="false" />
    <format attr="display-field-labels" scope="rows" value="false" />
  </style-rule>
</style>
```

**Critical:** The `worksheet` element + `display-field-labels` attr is the one that actually works. The `field-labels` element alone is insufficient. Always include both for belt-and-suspenders safety.

### 25.10 Hiding Measure Axis Per-Field — VALIDATED

To hide the measure axis (tick labels like 0K, 5K, 10K) while keeping mark labels, add a per-field `display: false` format on the `axis` style-rule. Target the specific measure field and its scope (cols for horiz bars, rows for vertical bars/monthly charts).

```xml
<style-rule element="axis">
  <format attr="display" class="0" 
          field="[ds].[sum:Sales:qk]" scope="cols" value="false" />
</style-rule>
```

For sparklines, hide BOTH axes:
```xml
<style-rule element="axis">
  <format attr="display" class="0" 
          field="[ds].[sum:measure:qk]" scope="rows" value="false" />
  <format attr="display" class="0" 
          field="[ds].[mn:Order Date:ok]" scope="cols" value="false" />
</style-rule>
```

### 25.11 Aggregate String Calcs Need User Derivation

Calculated fields that return strings but contain aggregate functions (SUM, COUNTD) must use `derivation="User"` with `usr:` prefix and `nk` suffix — NOT `derivation="None"` with `none:` prefix. Using `None` derivation for an aggregate calc prevents Tableau from evaluating it.

```python
# Arrow calc: string result but contains SUM() → aggregate
# WRONG:  add_col_inst(deps, raw, "None", "nk", "nominal")  → won't compute
# CORRECT: add_col_inst(deps, raw, "User", "nk", "nominal") → works

# Reference: [usr:Calculation_xxx:nk] not [none:Calculation_xxx:nk]
```

### 25.12 Colored YoY Arrow Pattern (Split Up/Down)

Create two calculated fields per metric — one for up arrow (green), one for down arrow (red). Each returns the arrow character when its condition is met, empty string otherwise. In the customized-label, use separate `<run>` elements with different `fontcolor` values.

```python
# Arrow calcs (aggregate string → User derivation)
_yoy = f"({cy_agg} - {py_agg}) / ABS({py_agg})"
def_calc("sales_arrow_up", "Sales Arrow Up",
         f'IF {_yoy} >= 0 THEN "▲" ELSE "" END',
         "string", "dimension", "nominal")
def_calc("sales_arrow_down", "Sales Arrow Down",
         f'IF {_yoy} < 0 THEN "▼" ELSE "" END',
         "string", "dimension", "nominal")
```

```xml
<!-- In customized-label: green up, red down, then neutral YoY value -->
<run fontcolor="#59A14F" fontsize="11"><![CDATA[<[ds].[usr:arrow_up:nk]>]]></run>
<run fontcolor="#E15759" fontsize="11"><![CDATA[<[ds].[usr:arrow_down:nk]>]]></run>
<run fontcolor="#333333" fontsize="9"><![CDATA[ <[ds].[usr:yoy:qk]> vs PY]]></run>
```

### 25.13 Recommended Style Function Pattern

Build a reusable style function that accepts per-field axis hiding and includes all clean-chart rules:

```python
def _basic_style(hide_axis_fields=None):
    style = ET.Element("style")
    ax = sub(style, "style-rule", {"element": "axis"})
    if hide_axis_fields:
        for field_ref, scope in hide_axis_fields:
            sub(ax, "format", {"attr": "display", "class": "0",
                               "field": field_ref, "scope": scope, "value": "false"})
    fl = sub(style, "style-rule", {"element": "field-labels"})
    sub(fl, "format", {"attr": "display", "scope": "cols", "value": "off"})
    sub(fl, "format", {"attr": "display", "scope": "rows", "value": "off"})
    sr = sub(style, "style-rule", {"element": "mark"})
    sub(sr, "format", {"attr": "mark-labels-show", "value": "true"})
    sub(sr, "format", {"attr": "mark-labels-cull", "value": "true"})
    ws_sr = sub(style, "style-rule", {"element": "worksheet"})
    sub(ws_sr, "format", {"attr": "display-field-labels", "scope": "cols", "value": "false"})
    sub(ws_sr, "format", {"attr": "display-field-labels", "scope": "rows", "value": "false"})
    ref = sub(style, "style-rule", {"element": "refline"})
    sub(ref, "format", {"attr": "line-visibility", "value": "off"})
    gr = sub(style, "style-rule", {"element": "gridline"})
    sub(gr, "format", {"attr": "stroke-size", "value": "0"})
    sub(gr, "format", {"attr": "line-visibility", "value": "off"})
    ax_t = sub(style, "style-rule", {"element": "axis-title"})
    sub(ax_t, "format", {"attr": "display", "value": "off"})
    return style
```

### 25.14 Self-Learning from Tableau Desktop Saves

When the user modifies a generated TWB in Tableau Desktop and saves, **diff the XML to learn new patterns**. See §25.14-procedure below.

#### Self-Learning Procedure

1. **Detect user modifications**: When the user says "I fixed X in Tableau" or "learn from worksheet Y", diff the current TWB against the last generated version.
2. **Isolate the changed worksheet**: Compare the specific worksheet XML before and after.
3. **Extract the pattern**: Identify new/changed `<style-rule>`, `<format>`, or structural elements.
4. **Document in this file**: Add a new subsection under §25 with the pattern, XML example, and context.
5. **Update `_basic_style()` or builder functions**: Apply the learned pattern to the generator code.
6. **Regenerate and verify**: Re-run the generator to confirm the fix propagates to all worksheets.

#### Example: Learning Field Label Hiding

```
User: "I saved the things I want in Customers by Region. Learn from that."
Agent:
  1. Read "Customers By Region" worksheet XML from saved TWB
  2. Compare to other (unmodified) worksheets
  3. Found new style-rule: <style-rule element="worksheet">
       <format attr="display-field-labels" scope="rows" value="false" />
     </style-rule>
  4. Found per-field axis hiding: <format attr="display" class="0" 
       field="[ds].[ctd:Customer ID:qk]" scope="cols" value="false" />
  5. Applied both patterns to _basic_style() and all builders
  6. Documented as §25.9 and §25.10
```

### 25.15 Official XSD Schema Reference

Tableau publishes official XSD schemas at: `https://github.com/tableau/tableau-document-schemas`

Use this to validate element names, attribute values, and format attr enumerations before adding new style-rules. Key enumerations found in the XSD:

- **style-rule elements**: `axis`, `axis-title`, `field-labels`, `field-labels-decoration`, `field-labels-spanner`, `header`, `mark`, `table`, `gridline`, `zeroline`, `table-div`, `refline`, `worksheet`, `cell`, `label`, `dropspot`
- **format attrs**: `display`, `display-field-labels`, `stroke-size`, `line-visibility`, `mark-color`, `mark-labels-show`, `mark-labels-cull`, `mark-transparency`, `font-family`, `font-size`, `font-style`, `background-color`, `border-style`, `border-color`, `border-width`, `margin`, `padding`, `corner-radius` (zone-style only, NOT format attr)
- **Zone attributes**: `show-title` (boolean), `show-caption` (boolean), `hidden-by-user` (boolean), `friendly-name` (string)

---

## 26. Desktop Save Learnings — Measure Names Text Table (YoY Monthly Metrics)

Learnings from comparing a programmatically generated Measure Names text table TWB with the version saved by Tableau Desktop 2026.1.

### 26.1 Measure Names filter: use `level-members` not `union`

When the filter should include ALL measures, Desktop rewrites the `union` of individual `member` groupfilters to a single `level-members` call:

```xml
<!-- WRONG (verbose, fragile when adding new measures) -->
<groupfilter function="union" user:ui-domain="database" user:ui-enumeration="inclusive" user:ui-marker="enumerate">
  <groupfilter function="member" level="[:Measure Names]" member="..." />
  <groupfilter function="member" level="[:Measure Names]" member="..." />
</groupfilter>

<!-- CORRECT (Desktop-canonical form) -->
<groupfilter function="level-members" level="[:Measure Names]" />
```

Drop all `user:ui-*` attributes — they cause `attribute not declared` errors.

### 26.2 Manual sort for Measure Names column order

Desktop preserves column order via `<manual-sort>`. Without it, columns appear in alphabetical or definition order.

```xml
<manual-sort column="[DS].[:Measure Names]" direction="ASC">
  <dictionary>
    <bucket>"[DS].[sum:m01_value:qk]"</bucket>
    <bucket>"[DS].[sum:m01_yoy:qk]"</bucket>
    <!-- ... remaining measures in display order ... -->
  </dictionary>
</manual-sort>
```

### 26.3 Slices element required alongside Measure Names filter

Desktop adds a `<slices>` element that mirrors the filter column:

```xml
<slices>
  <column>[DS].[:Measure Names]</column>
</slices>
```

### 26.4 Text encoding: `[Multiple Values]` not individual measures

When multiple measures are on the text shelf, Desktop uses a single `[Multiple Values]` encoding instead of listing each measure:

```xml
<!-- WRONG (individual measures — may cause "Malformed expression") -->
<encodings>
  <text column="[DS].[sum:m01_value:qk]" />
  <text column="[DS].[sum:m01_yoy:qk]" />
</encodings>

<!-- CORRECT (Desktop-canonical form) -->
<encodings>
  <text column="[DS].[Multiple Values]" />
</encodings>
```

### 26.5 Mark class: `Automatic` for Measure Names text tables

Desktop uses `Automatic` (not `Text`) for the mark class in Measure Names text tables:

```xml
<mark class="Automatic" />
```

Add `mark-labels-show` in the pane-level style:

```xml
<pane>
  ...
  <style>
    <style-rule element="mark">
      <format attr="mark-labels-show" value="true" />
    </style-rule>
  </style>
</pane>
```

### 26.6 Dashboard sizing: `sizing-mode="fixed"` and correct zone coordinates

Desktop sets explicit sizing mode and uses full 100000-coordinate zones:

```xml
<size maxheight="600" maxwidth="1300" minheight="600" minwidth="1300" sizing-mode="fixed" />
```

Zone coordinates use the full `100000` space (not `98000` with margins):

```xml
<zone h="100000" id="2" type-v2="layout-basic" w="100000" x="0" y="0">
  <zone h="100000" id="3" param="vert" type-v2="layout-flow" w="100000" x="0" y="0">
    <zone fixed-size="102" h="17000" id="4" is-fixed="true" type-v2="text" w="100000" x="0" y="0" />
    <zone h="83000" id="5" name="WS" w="100000" x="0" y="17000" />
  </zone>
</zone>
```

### 26.7 Root zone border: explicit `none` style

Desktop adds explicit border-none styling to the root zone:

```xml
<zone-style>
  <format attr="border-color" value="#000000" />
  <format attr="border-style" value="none" />
  <format attr="border-width" value="0" />
  <format attr="background-color" value="#f0f3fa" />
</zone-style>
```

### 26.8 Windows: `source-height`, `hidden` worksheet, `measures` card

Desktop adds these attributes to windows:

```xml
<windows source-height="30">
  <window class="dashboard" maximized="true" name="Dashboard Name">
    ...
    <simple-id uuid="{...}" />
  </window>
  <window class="worksheet" hidden="true" name="Worksheet Name">
    <cards>
      <edge name="left">
        <strip size="160">
          <card type="pages" />
          <card type="filters" />
          <card type="marks" />
          <card type="measures" />  <!-- NEW: measures card -->
        </strip>
      </edge>
      ...
    </cards>
    <simple-id uuid="{...}" />
  </window>
</windows>
```

The worksheet window does NOT need a `<viewpoint>` child — Desktop removes it.

### 26.9 Worksheet layout-cache: cell-count mode

For text tables with a fixed number of rows, Desktop uses cell-count layout:

```xml
<layout-cache cell-count-h="7" minwidth="100" non-cell-size-h="20" type-h="cell" type-w="scalable" />
```

### 26.10 Source-build and document-format-change-manifest

Match the Desktop version in `source-build`. Desktop 2026.1 adds these manifest tags:

```xml
<document-format-change-manifest>
  <AnimationOnByDefault />
  <DatabricksCatalog />
  <MarkAnimation />
  <SchemaViewerObjectModel />
  <SetMembershipControl />
  <SheetIdentifierTracking />
  <SortTagCleanup />
  <WindowsPersistSimpleIdentifiers />
</document-format-change-manifest>
```

### 26.11 Preferences and global style

Desktop adds shelf height preferences and animation-off style:

```xml
<preferences>
  <preference name="ui.encoding.shelf.height" value="24" />
  <preference name="ui.shelf.height" value="26" />
</preferences>
<style>
  <style-rule element="animation">
    <format attr="animation-on" value="ao-off" />
  </style-rule>
</style>
```

### 26.12 Style rule order: `table` before `worksheet`

Desktop orders worksheet style rules as `table` first, then `worksheet`:

```xml
<style>
  <style-rule element="table">
    <format attr="show-null-value-warning" value="false" />
  </style-rule>
  <style-rule element="worksheet">
    <format attr="display-field-labels" scope="cols" value="false" />
    <format attr="display-field-labels" scope="rows" value="false" />
  </style-rule>
</style>
```

### 26.13 Split Up/Down Arrows in Measure Names Text Table

For Measure Names text tables, per-cell conditional coloring is not possible via XML alone. Use split positive/negative arrow calculated fields as separate Measure Names columns:

```python
ARROW_CALCS = [
    {"calc_id": "Calculation_XXX", "caption": "Jan ▲",
     "formula": 'IF SUM([m01_yoy]) > 0 THEN "▲" ELSE "" END', "color": "#59A14F"},
    {"calc_id": "Calculation_YYY", "caption": "Jan ▼",
     "formula": 'IF SUM([m01_yoy]) < 0 THEN "▼" ELSE "" END', "color": "#E15759"},
]
```

Column definition (in datasource AND datasource-dependencies):

```xml
<column caption="Jan ▲" datatype="string" name="[Calculation_XXX]" role="measure" type="nominal">
  <calculation class="tableau" formula='IF SUM([m01_yoy]) &gt; 0 THEN "▲" ELSE "" END' />
</column>
```

Column-instance (in datasource-dependencies only, NOT at datasource level):

```xml
<column-instance column="[Calculation_XXX]" derivation="User" name="[usr:Calculation_XXX:nk]" pivot="key" type="nominal" />
```

Manual sort places arrows between value and YoY: `value → ▲ → ▼ → yoy`.

**Coloring**: In Tableau Desktop, right-click each ▲ column header → Format → Font → Color → green. Same for ▼ → red. The split ensures only one arrow shows content per cell.

## 27. Multi-Pane Shape Marks with Boolean-Driven Color/Shape (Superstore Pattern)

The superstore TWB uses a proven pattern for conditional arrow shapes with per-cell coloring:

### 27.1 Boolean dimension fields drive both color and shape

Create boolean dimension calcs that evaluate to true/false. The formula must be **non-aggregate** to produce a dimension (not a measure):

```xml
<column caption="Jan Direction" datatype="boolean" name="[Calculation_blm01001]"
        role="dimension" type="nominal">
  <calculation class="tableau" formula="[m01_yoy] &gt;= 0" />
</column>
```

If source data has one row per mark, referencing the measure directly without SUM/AVG works as a row-level boolean dimension.

### 27.2 Datasource-level column-instances with derivation="None"

Boolean dimensions need `derivation="None"` and suffix `:nk` (nominal key):

```xml
<column-instance column="[Calculation_blm01001]" derivation="None"
                 name="[none:Calculation_blm01001:nk]" pivot="key" type="nominal" />
```

### 27.3 Paired color + shape encodings in datasource style

The datasource's `<style><style-rule element="mark">` holds encodings that map boolean true/false to hex colors and Arrow shape PNGs:

```xml
<encoding attr="color" field="[none:Calculation_blm01001:nk]" type="palette">
  <map to="#59A14F"><bucket>true</bucket></map>
  <map to="#E15759"><bucket>false</bucket></map>
</encoding>
<encoding attr="shape" field="[none:Calculation_blm01001:nk]" type="shape">
  <map to="Arrows/1-4.png"><bucket>true</bucket></map>
  <map to="Arrows/1-8.png"><bucket>false</bucket></map>
</encoding>
```

Repeat for each period's boolean field.

### 27.4 Multi-pane worksheet structure

Use explicit AVG(0) measure axes on cols to create separate panes — one Shape pane per period, each combining value + arrow + YoY%:

- **Default pane** (no `id`, mark class="Square"): required first pane in multi-pane layouts, acts as a structural placeholder
- **Shape panes** (mark class="Shape"): show colored arrow with value and YoY% as customized label text

Cols expression nests axes: `(axis_m01 + (axis_m02 + (axis_m03 + axis_ytd)))`. Each AVG(0) axis creates one pane.

Each axis calc uses `formula="AVG(0)"` with `datatype="real"` and a caption matching the period label (e.g., "Jan", "Feb").

### 27.5 Shape pane configuration

Each Shape pane shows the metric value, arrow, and colored YoY% in a single combined label (3 runs, no spacer):

```xml
<pane id="1" x-axis-name="[DS].[usr:axis_calc:qk]"
      selection-relaxation-option="selection-relaxation-allow">
  <view><breakdown value="auto" /></view>
  <mark class="Shape" />
  <mark-sizing mark-sizing-setting="marks-scaling-off" />
  <encodings>
    <color column="[DS].[none:bool_calc:nk]" />
    <text column="[DS].[sum:m01_value:qk]" />
    <text column="[DS].[usr:yoy_pos:qk]" />
    <text column="[DS].[usr:yoy_neg:qk]" />
    <shape column="[DS].[none:bool_calc:nk]" />
  </encodings>
  <customized-label>
    <formatted-text>
      <run fontsize="10"><![CDATA[<[DS].[sum:m01_value:qk]>]]></run>
      <run fontcolor="#59A14F" fontsize="9"><![CDATA[<[DS].[usr:yoy_pos:qk]>]]></run>
      <run fontcolor="#E15759" fontsize="9"><![CDATA[<[DS].[usr:yoy_neg:qk]>]]></run>
    </formatted-text>
  </customized-label>
  <style>
    <style-rule element="mark">
      <format attr="mark-labels-show" value="true" />
      <format attr="mark-labels-cull" value="false" />
      <format attr="shape" value="Arrows/1-4.png" />
      <format attr="size" value="1.6591712236404419" />
    </style-rule>
  </style>
</pane>
```

Key details:
- `mark-sizing-setting="marks-scaling-off"` keeps arrow size consistent
- **3 runs** in customized-label: value (fontsize 10), positive YoY (green, fontsize 9), negative YoY (red, fontsize 9) — no spacer run needed
- Value text encoding (`sum:` derivation) plus pos/neg YoY encodings (`usr:` derivation) all on the same pane
- Default shape `Arrows/1-4.png` in the style rule is overridden by the shape encoding
- `size` format controls arrow mark size (values around 1.57–1.66 work well)
- CDATA wraps field references using Tableau's `<field_ref>` label syntax

### 27.6 Split positive/negative YoY text calcs

Two aggregate calcs per period — only one returns a value per row, the other is null. Divide by 100 since Tableau's `p` (percentage) format automatically multiplies by 100:

```
YoY+ = IF SUM([m01_yoy]) >= 0 THEN SUM([m01_yoy]) / 100 END
YoY- = IF SUM([m01_yoy]) < 0  THEN SUM([m01_yoy]) / 100 END
```

Column definition must include `default-format="p0.0%"` for percentage display. These use `derivation="User"` (aggregate calcs) with `:qk` suffix.

### 27.7 Hiding axes in multi-pane layout

Hide all axes since values appear as mark labels, not bar positions:

```xml
<style-rule element="axis">
  <format attr="display" class="0" field="[DS].[sum:m01_value:qk]" scope="cols" value="false" />
  <format attr="display" class="0" field="[DS].[usr:arrow_axis:qk]" scope="cols" value="false" />
</style-rule>
```

### 27.8 Embedded arrow shapes in `<external>`

For TWB portability (no dependency on local Shapes repo), embed base64 PNGs:

```xml
<external>
  <shapes>
    <shape name="Arrows/1-4.png">iVBORw0KGgo...</shape>
    <shape name="Arrows/1-8.png">iVBORw0KGgo...</shape>
  </shapes>
</external>
```

Standard Tableau arrow shapes: `1-4.png` = up arrow, `1-8.png` = down arrow.

### 27.9 Post-processing for label CDATA in Python generators

ET doesn't support CDATA natively. Use placeholder text in `<run>` elements and regex replacement:

```python
# In code:  run.text = f"FREF{{{field_ref}}}FREF"
# In post_process:  re.sub(r'FREF\{([^}]+)\}FREF', r'<![CDATA[<\1>]]>', xml_str)
```

This converts `FREF{[DS].[usr:calc:qk]}FREF` → `<![CDATA[<[DS].[usr:calc:qk]>]]>`.

### 27.10 Complete worksheet style rules for clean multi-pane tables

A polished multi-pane table needs comprehensive style rules beyond just hiding axes. The full set:

```xml
<style>
  <!-- Hide all column axes (AVG(0) spacers) -->
  <style-rule element="axis">
    <format attr="display" class="0" field="[DS].[usr:axis_m01:qk]" scope="cols" value="false" />
    <!-- repeat per axis -->
  </style-rule>

  <!-- Remove all cell borders -->
  <style-rule element="cell">
    <format attr="border-color" value="#000000" />
    <format attr="border-style" value="none" />
    <format attr="border-width" value="0" />
  </style-rule>

  <!-- Remove header borders -->
  <style-rule element="header">
    <format attr="border-color" value="#000000" />
    <format attr="border-style" value="none" />
    <format attr="border-width" value="0" />
  </style-rule>

  <!-- Left-align row labels -->
  <style-rule element="label">
    <format attr="text-align" field="[DS].[none:sort_order:ok]" value="left" />
  </style-rule>

  <!-- Remove pane borders -->
  <style-rule element="pane">
    <format attr="border-color" value="#000000" />
    <format attr="border-style" value="none" />
    <format attr="border-width" value="0" />
  </style-rule>

  <!-- Remove table borders, suppress null warnings -->
  <style-rule element="table">
    <format attr="show-null-value-warning" value="false" />
    <format attr="border-color" value="#000000" />
    <format attr="border-style" value="none" />
    <format attr="border-width" value="0" />
  </style-rule>

  <!-- Hide field labels on both shelves -->
  <style-rule element="worksheet">
    <format attr="display-field-labels" scope="cols" value="false" />
    <format attr="display-field-labels" scope="rows" value="false" />
  </style-rule>

  <!-- Remove gridlines on columns -->
  <style-rule element="gridline">
    <format attr="stroke-size" scope="cols" value="0" />
    <format attr="line-visibility" scope="cols" value="off" />
  </style-rule>

  <!-- Remove zero lines -->
  <style-rule element="zeroline">
    <format attr="stroke-size" value="0" />
    <format attr="line-visibility" value="off" />
  </style-rule>
</style>
```

Key points:
- `gridline` and `zeroline` rules are essential — without them, Tableau draws default lines between panes
- `label` text-align controls row header alignment (default is centered, `left` is cleaner for KPI names)
- `show-null-value-warning="false"` on table suppresses the indicator icon when YoY+ or YoY- is null

### 27.11 Dashboard zone layout for multi-pane with column headers

Dashboard structure uses a vertical flow with three tiers: title, column headers, worksheet.

```
layout-basic (root)
  └── layout-flow (vertical, id=3)
        ├── text zone (title, id=4, fixed-size=102, h=17000)
        ├── layout-flow (horizontal, id=6, fixed-size=32, h=5333)
        │     ├── text zone (spacer, id=10, w=15500, fixed-size=186)
        │     ├── text zone ("Jan", id=20, w=20875)
        │     ├── text zone ("Feb", id=21, w=20875)
        │     ├── text zone ("Mar", id=22, w=21541)
        │     └── text zone ("YTD", id=23, w=21208)
        └── worksheet zone (id=5, h=77665, y=22333)
```

Key layout details:
- **Spacer zone** aligns with the row-label column width; use `fixed-size` attribute to prevent Tableau from resizing
- **Header text zones** distribute remaining width across periods; slight width variation is normal from Tableau's layout engine
- Column header `<run>` elements: `bold="true"`, `fontsize="12"`, `fontname="Tableau Semibold"`, `fontcolor="#1b2838"` — do NOT use `align` attribute (invalid on `<run>`)
- Each header zone needs full border styling: `border-color="#000000"`, `border-style="none"`, `border-width="0"`, `padding="4"`, `background-color="#e8ecf4"`
- Dashboard size of 1200×600 works well for 4-period layouts

### 27.12 Troubleshooting: Errors encountered building multi-pane shape dashboards

A catalog of errors hit during development of the YoY Monthly Metrics dashboard with multi-pane shapes, and their root causes.

#### Error 1: `D2E8DA72` — `attribute '{...xml/user}op' is not declared for element 'filter'`

**Cause**: Adding `user:op="manual"` to a `<filter>` element. The `user:op` attribute is not in the Tableau schema for filters in programmatically generated TWBs.

**Fix**: Remove the `user:op` attribute from filter elements entirely.

#### Error 2: `D2E8DA72` — `element 'windows' declares duplicate identity constraint unique values`

**Cause**: Dashboard and worksheet sharing the same `name` attribute value. The `<windows>` section enforces unique names across all window entries.

**Fix**: Ensure the worksheet `name` and dashboard `name` are different strings (e.g., "YoY Metrics Table" vs "YoY Monthly Metrics").

#### Error 3: `Malformed expression: unable to associate operators with operands`

**Cause**: Using `<` and `<=` comparison operators in Custom SQL embedded within TWB XML. Even inside `CDATA`, some Tableau versions misparse SQL with `<` when the overall XML structure is complex.

**Fix**: Reverse comparisons to use `>` and `>=` instead. For example, change `WHERE event_timestamp < CURRENT_DATE` to `WHERE CURRENT_DATE > event_timestamp`. This also avoids XML entity encoding issues.

Also check that the Custom SQL is wrapped in `<![CDATA[...]]>` — without CDATA, `<` characters will break XML parsing.

#### Error 4: `D2E8DA72` — `element 'layout' is not allowed for content model`

**Cause**: `<layout>` element placed after `<style>` in the datasource. The datasource schema requires strict child element ordering.

**Fix**: Place `<layout>` before `<style>` in the datasource. The correct order is: `aliases → column* → column-instance* → ... → layout → style → semantic-values → ...`. See section 1 for the full element order.

#### Error 5: `6EA18A9E` — `Internal Error - An unexpected error occurred`

This generic internal error appeared repeatedly when building multi-pane shape worksheets. It has **multiple possible causes** — each was discovered incrementally:

| Root Cause | Symptom | Fix |
|---|---|---|
| AVG(0) axis `datatype="integer"` | Pane axes fail to render | Use `datatype="real"` and `formula="AVG(0)"` (not `formula="0"`) |
| Boolean calc uses raw aggregate (`SUM([yoy]) >= 0`) | Field acts as measure, not dimension | Use FIXED LOD: `{ FIXED [sort_order] : MIN([m01_yoy]) } >= 0` |
| `<column-instance>` mixed with `<column>` in dependencies | Schema ordering violation | List ALL `<column>` elements first, then ALL `<column-instance>` elements in `<datasource-dependencies>` |
| Missing default pane | Multi-pane structure incomplete | Add a default pane (no `id` attribute, `mark class="Square"`) as the FIRST pane |
| `mark class="Text"` in multi-pane | Incompatible mark type | Use `mark class="Shape"` or `mark class="Square"` for explicit panes |
| Explicit pane `id` starting from "0" | Conflicts with default pane | Number explicit panes starting from `id="1"` |

**Debugging strategy**: When hitting `6EA18A9E`, compare the generated XML element-by-element against a known working TWB (e.g., superstore). Focus on:
1. Calculated field `datatype` and `formula` attributes
2. Boolean dimension formulas (must be LOD or non-aggregate)
3. Element ordering in datasource-dependencies
4. Pane structure (default pane required, id numbering)

#### Error 6: `D2E8DA72` — `attribute 'align' is not declared for element 'run'`

**Cause**: Setting `align="center"` on `<run>` elements in dashboard text zones. The `align` attribute is not valid on `<run>`.

**Fix**: Remove the `align` attribute from `<run>` elements. Text alignment in dashboard text zones is controlled by Tableau Desktop formatting, not by XML attributes on runs. For worksheet labels, use `<style-rule element="label">` with `<format attr="text-align" value="left" />`.

---

## §28 Multi-Tab UA Dashboard — Learnings (2026-03)

Patterns and pitfalls discovered while building a 4-tab, 36-worksheet, 4-datasource UA costs dashboard with BAN KPIs, sparklines, bar charts, line charts, and detail tables.

### 28.1 zone-style must be LAST child in layout-basic containers

**Error:** `D2E8DA72` — `element 'zone' is not allowed for content model '(formatted-text,layout-cache?,zone,flipboard,zone-style?)'`

**Cause:** The `<zone-style>` element was placed as the **first child** of a `layout-basic` container zone, before the child `<zone>` elements. Tableau's content model requires `zone-style` to be the **last** child element.

**Fix:** Always append `<zone-style>` AFTER all child `<zone>` elements inside `layout-basic` containers:

```python
# WRONG — zone-style before child zones
root_zs = sub(root, "zone-style")
sub(root_zs, "format", {"attr": "background-color", "value": "#f0f3fa"})
sub(root, "zone", {...})  # child zones after zone-style

# CORRECT — zone-style after all child zones
sub(root, "zone", {...})  # all child zones first
root_zs = sub(root, "zone-style")  # zone-style last
sub(root_zs, "format", {"attr": "background-color", "value": "#f0f3fa"})
```

This applies to ALL container zones (`layout-basic`, `layout-flow`) that have a `zone-style`.

### 28.2 Multiple measures on a single shelf cause "Malformed expression"

**Error:** `Malformed expression: unable to associate operators with operands.`

**Cause:** Placing multiple space-separated field references on `<rows>` or `<cols>`:

```xml
<!-- FAILS — space-separated measures on rows -->
<rows>[ds].[sum:actual:qk] [ds].[sum:goal:qk]</rows>

<!-- ALSO FAILS — space-separated measures on cols (text table) -->
<cols>[ds].[sum:spend:qk] [ds].[sum:impressions:qk] [ds].[sum:clicks:qk]</cols>
```

In Tableau Desktop-saved files, space-separated measures on shelves work because Desktop writes additional internal metadata. In programmatically generated TWBs, the parser cannot correctly tokenize these expressions.

**Workarounds (in order of reliability):**

1. **Dual-axis with parentheses and `+`:** `<rows>([ds].[sum:goal:qk] + [ds].[sum:actual:qk])</rows>` — works for BOTH the same measure twice (sparkline overlay) AND two different measures (actual vs goal grouped bars). Requires 3 panes, Measure Names color encoding, and datasource-level column-instances + color map. See §28.12 for full pattern.
2. **Separate worksheets:** One worksheet per measure, placed side-by-side in the dashboard. Simplest fallback when dual-axis is not needed.
3. **Simplify to single measure:** For text tables, use the primary dimension + primary measure as a simple bar chart instead of a multi-measure crosstab.

**NEVER use** space-separated measures on shelves in generated TWBs. This includes:
- Two measures on `<rows>` WITHOUT parentheses (creates stacked panes in Desktop)
- Multiple measures on `<cols>` (creates columns in text tables)
- Any combination of space-separated field references without `(` `)` and `+`

### 28.3 has_agg detection must include cross-references to other calculated fields

**Error:** Calculated fields that compute percentage changes (e.g., `(ZN([Calculation_X]) - ZN([Calculation_Y])) / ABS(ZN([Calculation_Y]))`) were incorrectly assigned `derivation="Sum"` / `sum:` prefix instead of `derivation="User"` / `usr:` prefix.

**Cause:** The `has_agg()` helper only checked for direct aggregate function calls (`SUM(`, `AVG(`, `COUNTD(`, etc.) in the formula. It did not detect that a formula referencing another calculated field (via `[Calculation_XXXXX]`) is implicitly aggregated if that referenced calc contains aggregation.

**Fix:** Extend `has_agg()` to treat any reference to another calculation as implicitly aggregated:

```python
def has_agg(formula):
    upper = formula.upper()
    if any(fn in upper for fn in ["SUM(", "AVG(", "COUNTD(", "COUNT(", "MIN(", "MAX("]):
        return True
    if "[Calculation_" in formula:
        return True
    return False
```

**Rule:** Any calculated field whose formula contains `[Calculation_` (a reference to another calc) should use `derivation="User"` / `usr:` prefix, because the referenced calc likely contains aggregation. This is a safe conservative approach — Tableau handles `usr:` correctly even if the underlying calc is non-aggregated.

### 28.4 Sparklines should use raw source fields for full trends

**Problem:** Sparklines using the BAN's `_cy` calculated field (e.g., `SUM(IF DATEDIFF("month", [date], TODAY()) = 0 THEN [measure] END)`) show only a single data point for the current month, resulting in a dot instead of a trend line.

**Fix:** Sparklines should use the raw source field (with `SUM` aggregation) or a dedicated trend calculated field:

- **Simple sum KPIs** (total spend, revenue, impressions): Use the raw source field directly:
  ```python
  build_sparkline("T1 total_spend Spark", DS1, DS1_CAP, "total_spend",
                  raw_field="new_spend")
  ```

- **Ratio KPIs** (CAC, ROAS, CTR, CPC): Create a dedicated trend calc without any date restriction:
  ```python
  def_calc(DS1, "cac_trend", "CAC Trend",
           "SUM([new_spend]) / SUM([new_orders_completed_hosting_plugin])")
  build_sparkline("T1 blended_cac Spark", DS1, DS1_CAP, "blended_cac",
                  calc_key="cac_trend")
  ```

The BAN's `_cy` calcs are designed for current-month-only aggregation. Sparklines need the full 12-month series.

### 28.5 fit-width zoom for worksheets with many rows

Worksheets displaying tables or long dimension lists (e.g., campaign names, performance summaries) should use `fit-width` zoom instead of `entire-view` to prevent horizontal scrolling:

```python
fit_width_sheets = {"Top Campaigns", "Campaign Performance", "Performance Summary"}

# In windows
vp = sub(ww, "viewpoint")
zoom_type = "fit-width" if sn in fit_width_sheets else "entire-view"
sub(vp, "zoom", {"type": zoom_type})
```

Apply `fit-width` in BOTH the worksheet `<window>` viewpoint AND the dashboard `<window>` viewpoints.

### 28.6 Date fields must use datatype="date" and Month-Trunc for proper date axis

When a data source has a `month` or `date` field that should display as a date axis (not a text label), always use:

```xml
<column datatype="date" name="[month]" role="dimension" type="ordinal" />
<column-instance column="[month]" derivation="Month-Trunc" name="[tmn:month:qk]"
                 pivot="key" type="quantitative" />
```

With the shelf reference:
```xml
<cols>[ds].[tmn:month:qk]</cols>
```

Do NOT use `discrete_date=True` with `derivation="None"` and `type="nominal"` (`[none:month:nk]`) unless you explicitly want a discrete text label axis. The continuous Month-Trunc treatment produces a proper date axis with Tableau's built-in date formatting.

### 28.7 Custom date-range filters using boolean calculated fields

For filtering data to a specific date range (e.g., from 2025 onwards), use a boolean calculated field with Tableau date literal syntax:

```python
def_calc(DS4, "date_filter_2025", "From 2025",
         "[month] >= #2025-01-01#", "boolean", "dimension", "nominal")
```

Then apply as a categorical filter for `true`:

```xml
<filter class="categorical"
        column="[ds].[none:Calculation_XXXX:nk]">
  <groupfilter function="member"
               level="[none:Calculation_XXXX:nk]"
               member="true" />
</filter>
```

This approach is more reliable than `relative-date` filters in programmatic TWBs, avoids the axis-conflict issue (§13.16), and allows flexible date ranges without parameters.

### 28.8 Databricks connection attributes for Desktop compatibility

When generating a Databricks `federated` datasource, include these additional connection attributes to match what Tableau Desktop saves:

```xml
<connection authentication="auth-pass" class="databricks"
            dbname="catalog" schema="schema_name"
            server="dbc-XXXX.cloud.databricks.com"
            v-http-path="/sql/1.0/warehouses/WAREHOUSE_ID"
            authentication-type=""
            odbc-connect-string-extras=""
            one-time-sql=""
            username=""
            v-query-tags=""
            workgroup-auth-mode="prompt">
```

The `authentication-type`, `odbc-connect-string-extras`, `one-time-sql`, `username`, and `v-query-tags` attributes are empty strings but their presence prevents Desktop from re-writing the connection block on save.

### 28.9 source_cols for datasource filter fields

When dashboard filters reference fields that aren't in the worksheet's `<datasource-dependencies>`, Tableau Desktop adds them to the datasource's `<connection>` block as `<cols>` entries. Pre-populate these in the generator to avoid Desktop re-writing the datasource:

```python
def build_databricks_ds(ds_name, ds_caption, table_name, nc_name, source_cols=None):
    # ... after <relation> ...
    if source_cols:
        cols_el = sub(conn, "cols")
        for sc in source_cols:
            sub(cols_el, "map", {"key": f"[{sc}]", "value": f"[{table_name}].[{sc}]"})
```

Common source_cols for dashboards with quick filters: `["country", "region"]`.

### 28.10 Preferences for shelf heights

Desktop saves shelf height preferences. Include them to reduce TWB diff noise on save:

```xml
<preferences>
  <preference name="ui.encoding.shelf.height" value="24" />
  <preference name="ui.shelf.height" value="26" />
</preferences>
```

### 28.12 Dual-axis bar with TWO DIFFERENT measures (Actual vs Goal pattern)

**Problem:** Space-separated measures on `<rows>` causes "Malformed expression" (§28.2). But the user wants actual and goal displayed as grouped bars in a single worksheet.

**Solution (Desktop-validated):** Use the parentheses+plus dual-axis pattern with two DIFFERENT measures — `([ds].[sum:goal:qk] + [ds].[sum:actual:qk])`. This creates a dual-axis with synchronized scales. Previously documented as working only for the SAME measure twice (sparklines), but Desktop confirms it works for two different measures when combined with Measure Names color encoding.

**Complete structure:**

```xml
<worksheet name='Monthly Actual'>
  <table>
    <view>
      <datasource-dependencies datasource='ds_name'>
        <!-- Both measures + date + filter calc + extra dims for quick filters -->
        <column datatype='real' name='[actual]' role='measure' type='quantitative' />
        <column datatype='real' name='[goal]' role='measure' type='quantitative' />
        <column aggregation='Count' datatype='date' datatype-customized='true'
                name='[month]' role='dimension' type='ordinal' />
        <column-instance column='[actual]' derivation='Sum' name='[sum:actual:qk]' pivot='key' type='quantitative' />
        <column-instance column='[goal]' derivation='Sum' name='[sum:goal:qk]' pivot='key' type='quantitative' />
        <column-instance column='[month]' derivation='Month-Trunc' name='[tmn:month:qk]' pivot='key' type='quantitative' />
      </datasource-dependencies>
    </view>
    <style>
      <style-rule element='axis'>
        <!-- Synchronized axis: actual synced to goal -->
        <encoding attr='space' class='0' field='[ds].[sum:actual:qk]'
                  field-type='quantitative' fold='true' scope='rows'
                  synchronized='true' type='space' />
        <!-- Hide the actual axis (show only goal axis) -->
        <format attr='display' class='0' field='[ds].[sum:actual:qk]' scope='rows' value='false' />
        <!-- Empty title on goal axis -->
        <format attr='title' class='0' field='[ds].[sum:goal:qk]' scope='rows' value='' />
      </style-rule>
      <!-- ... standard field-labels, mark, worksheet, gridline, zeroline, table-div, axis-title rules ... -->
    </style>
    <panes>
      <!-- Default pane (no id) -->
      <pane selection-relaxation-option='selection-relaxation-allow'>
        <view><breakdown value='auto' /></view>
        <mark class='Bar' />
        <encodings>
          <color column='[ds].[:Measure Names]' />
        </encodings>
        <style><style-rule element='mark'>
          <format attr='mark-color' value='#7380AB' />
        </style-rule></style>
      </pane>
      <!-- Pane 1: actual axis -->
      <pane id='1' selection-relaxation-option='selection-relaxation-allow'
            y-axis-name='[ds].[sum:actual:qk]'>
        <!-- same content as default pane -->
      </pane>
      <!-- Pane 2: goal axis -->
      <pane id='2' selection-relaxation-option='selection-relaxation-allow'
            y-axis-name='[ds].[sum:goal:qk]'>
        <!-- same content as default pane -->
      </pane>
    </panes>
    <!-- Parentheses + plus: REQUIRED for dual-axis -->
    <rows>([ds].[sum:goal:qk] + [ds].[sum:actual:qk])</rows>
    <cols>[ds].[tmn:month:qk]</cols>
  </table>
</worksheet>
```

**Datasource-level prerequisites (ALL required):**

```xml
<datasource name='ds_name'>
  <!-- ... columns, calcs ... -->
  <!-- Datasource-level column-instances for both measures -->
  <column-instance column='[actual]' derivation='Sum' name='[sum:actual:qk]' pivot='key' type='quantitative' />
  <column-instance column='[goal]' derivation='Sum' name='[sum:goal:qk]' pivot='key' type='quantitative' />
  <!-- Layout MUST be present for color encoding -->
  <layout dim-ordering='alphabetic' measure-ordering='alphabetic' show-structure='true' />
  <!-- Measure Names color encoding at DATASOURCE level -->
  <style>
    <style-rule element='mark'>
      <encoding attr='color' field='[:Measure Names]' type='palette'>
        <map to='#4e79a7'>
          <bucket>"[ds_name].[sum:actual:qk]"</bucket>
        </map>
        <map to='#f28e2b'>
          <bucket>"[ds_name].[sum:goal:qk]"</bucket>
        </map>
      </encoding>
    </style-rule>
  </style>
</datasource>
```

**Key rules:**
1. `<rows>` uses parentheses + `+`: `([ds].[sum:goal:qk] + [ds].[sum:actual:qk])` — order matters (goal first = goal axis on left)
2. THREE panes required: default (no id) + id=1 (y-axis-name=actual) + id=2 (y-axis-name=goal)
3. EVERY pane needs `<color column='[ds].[:Measure Names]' />` encoding
4. `synchronized='true'` on the actual axis ensures both axes share the same scale
5. Datasource-level `<column-instance>` elements for BOTH measures are REQUIRED
6. `<layout show-structure='true' />` at datasource level is REQUIRED for color encoding
7. Color bucket values must be **fully-qualified with escaped quotes**: `"[ds_name].[sum:field:qk]"`
8. The `aggregation='Count'` and `datatype-customized='true'` attributes on the month column are what Desktop adds to indicate user-changed type

**This corrects §28.2** — the dual-axis parentheses+plus pattern DOES work for two different measures, not just the same measure twice. The critical difference from space-separated measures is the parentheses and `+` operator.

### 28.13 Hide all worksheet windows by default

When a workbook has dashboards, hide all individual worksheet tabs by adding `hidden='true'` to every worksheet `<window>` element:

```python
ww = sub(windows, "window", {"class": "worksheet", "hidden": "true", "name": sn})
```

This matches the Desktop behavior when right-clicking worksheets → "Hide All Sheets". Only dashboard tabs appear in the workbook tab bar.

### 28.14 Worksheet-level background-color creates double shading

**Problem:** Setting `background-color` on `<style-rule element='table'>` in worksheets causes double-shading when the dashboard zone also has a `background-color`. The worksheet gray (`#f5f5f5`) shows inside the dashboard's white card, creating an unwanted nested-box effect.

**Fix:** Never set worksheet-level table background color. Apply all background colors at the **dashboard zone level** only (via `<zone-style>`). Worksheets should remain transparent.

### 28.11 build_monthly_bar with configurable filter_key

When different tabs use different date filters (e.g., Tab 1-3 use a rolling 12-month filter, Tab 4 uses a "from 2025" filter), parameterize the filter key in the chart builder:

```python
def build_monthly_bar(name, ds_name, ds_caption, meas_name,
                      filter_key="date_filter"):
    # ...
    if (ds_name, filter_key) in CALCS:
        cf = C(ds_name, filter_key)
        # apply filter
```

This avoids duplicating builder functions for different filter strategies.

---

## §29 Automated TWB Validation (VALIDATED)

### 29.1 Version decision: 18.1 vs 26.1

Tableau published official XSD schemas for version 26.1 at `tableau/tableau-document-schemas` (Feb 2026). However, version 26.1 requires additional elements (`worksheet-number`, `explain-data`) and attributes (`number` on worksheets, `type` on marks) that are not fully documented in the public XSD. The public XSD is incomplete — `xmlschema` validation passes but Tableau Desktop rejects the file with D2E8DA72 errors.

**Decision:** Generated workbooks use `version="18.1"` with individual manifest entries. The 26.1 XSD is used for **advisory** validation only — known version-mismatch errors are filtered. Tier 2 custom structural checks are the blocking gate.

`ManifestByVersion` (26.1 feature) was tested and reverted — it requires `version="26.1"` which in turn requires `worksheet-number`, `explain-data`, and other undocumented changes.

### 29.2 Automated two-tier validation

Every generator script includes a `validate_twb()` function called at the end of `generate()`:

**Tier 1 — XSD validation (advisory)**:
- Validates against vendored `schemas/twb_2026.1.0.xsd` + `schemas/user_namespace.xsd`
- Reported as warnings, not blocking errors
- Known false positives filtered: `_.fcp.DashboardRoundedCorners` elements, missing `explain-data`, missing `worksheet-number`
- Useful for catching unexpected structural issues that Tier 2 doesn't cover

**Tier 2 — Custom structural checks (blocking)**:
- Dashboard zone worksheet references exist in `<worksheets>`
- Window references exist in `<worksheets>` or `<dashboards>`
- No duplicate zone IDs
- `<simple-id>` present on worksheets/dashboards (when `WindowsPersistSimpleIdentifiers` in manifest)
- `simple-id` uuid is braced (`{...}`)
- Worksheet element ordering: `table` before `simple-id`
- `zone-style` must be last child in container zones
- Datasource column ordering: columns before layout/style
- `style-rule element` values in the XSD enumeration (full `StyleElement-ST` set)
- `param-domain-type` values: `any`, `list`, or `range`
- Window structure: no empty `<cards/>` or `<viewpoint/>` (prevents Error 2805CF18)
- Calculated field references in `<datasource-dependencies>` resolve to defined columns

Validation behavior:
- Tier 2 errors → printed + `sys.exit(1)` — TWB not delivered
- Tier 1 / warnings → printed, generation continues
- Success → prints `Validation PASSED`