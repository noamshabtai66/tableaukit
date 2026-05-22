# Tableau TWB XML Schema Reference

Authoritative reference for **TWB workbook XML** (`.twb` internal structure). For validated generation workflows, structural pitfalls, and version-specific nuances, see [programmatic-twb-learnings.md](programmatic-twb-learnings.md) (especially **§13** critical structural rules). For error messages and remediation, see [error-codes-and-pitfalls.md](error-codes-and-pitfalls.md).

---

## Critical Context: Two Different XML Schemas

Tableau uses **two separate XML formats**: use **TWB elements** when building or parsing `.twb` files; use **REST API XML** (`tsRequest`/`tsResponse`) only for Server/Cloud API calls.

| Schema | Purpose | Format | Official XSD? |
|--------|---------|--------|---------------|
| **TWB Workbook XML** | Internal structure of `.twb` files | Proprietary XML | **Yes** — [`tableau/tableau-document-schemas`](https://github.com/tableau/tableau-document-schemas) (published Feb 2026, version 26.1) |
| **REST API XML** | Tableau Server/Cloud API requests/responses | `tsRequest` / `tsResponse` | Yes (e.g. `ts-api_3_28.xsd`) |

**This document describes TWB Workbook XML** only. REST API XML governs publish/download operations, not the inner layout of a saved workbook.

### Official TWB XSD

The official XSD is vendored locally at `projects/delphi/.cursor/skills/tableau-twb/schemas/twb_2026.1.0.xsd` and used for **advisory** validation in generator scripts. Key points:

- **Version mismatch**: The XSD targets version 26.1, but we generate version 18.1 workbooks. Version 26.1 requires additional elements (`worksheet-number`, `explain-data`) and attributes (`number`, `type`) not needed by 18.1. XSD errors are therefore reported as **warnings**, not blocking errors.
- **User namespace stub**: A companion `user_namespace.xsd` provides the `user:UserAttributes-AG` attribute group required by the TWB XSD.
- **XSD limitations**: The XSD validates structure only — calculated field formulas, cross-references, and connection attributes are NOT checked (`processContents="skip"` areas). The XSD also doesn't cover `_.fcp.*` feature-gated elements.
- **Blocking validation**: Tier 2 custom structural checks (element ordering, cross-references, simple-id presence) are the actual blocking gate. See `validate_twb()` in generator scripts.
- **Validation library**: Use Python `xmlschema` (`pip3 install xmlschema`) for advisory XSD validation.

---

## Root Workbook Structure

Every `.twb` begins with an XML declaration and a single `<workbook>` root.

```xml
<?xml version='1.0' encoding='utf-8' ?>
<workbook source-platform='mac'
          source-build='2025.3.3 (20253.26.0206.0336)'
          version='18.1'
          xmlns:user='http://www.tableausoftware.com/xml/user'>

  <document-format-change-manifest>
    <AnimationOnByDefault />
    <WindowsPersistSimpleIdentifiers />
    <_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners />
    <!-- ... other manifest entries ... -->
  </document-format-change-manifest>

  <preferences />
  <!-- datasources, worksheets, dashboards, windows -->
</workbook>
```

### Root attributes

| Attribute | Description |
|-----------|-------------|
| `source-platform` | `win` or `mac` — platform that created the file |
| `source-build` | Tableau build string (should match a real Desktop build); required for reliable opens — see [programmatic-twb-learnings.md §13.5](programmatic-twb-learnings.md) |
| `version` | Internal workbook XML version — use `18.1` for compatibility with Tableau 2025.3+ |
| `locale` | e.g. `en_US`, `en_GB` (optional) |
| `xmlns:user` | `http://www.tableausoftware.com/xml/user` — required for `user:`-prefixed attributes |

### ManifestByVersion (version 26.1 only — NOT used for generated workbooks)

Tableau 2026.1 introduced `<ManifestByVersion />` as a replacement for individual manifest feature tags. However, using it requires `version="26.1"` and additional elements (`worksheet-number`, `explain-data`) and attributes that are not fully documented. **Generated workbooks use version 18.1 with individual manifest entries** for maximum compatibility and reliability.

### Version mapping (typical)

| Tableau release era | `version` attribute |
|---------------------|---------------------|
| 2020.x–2024.x+ | `18.1` |

### `document-format-change-manifest` — valid entries

Include only manifest entries that match the target Tableau version. For programmatic generation, the safe default is **`ObjectModelEncapsulateLegacy`** only; Tableau Desktop adds other flags on save. See [programmatic-twb-learnings.md §13.7](programmatic-twb-learnings.md) for safe vs. unsafe manifest entries.

---

## Preferences

```xml
<preferences>
  <preference name='ui.encoding.shelf.height' value='250' />
  <preference name='ui.shelf.height' value='250' />
</preferences>
```

Stores UI defaults (shelf heights, palettes, etc.).

---

## Datasources Section

### Child order (content model)

Datasource children must follow this order (violations commonly surface as schema errors such as **D2E8DA72**):

`repository-location?` → `connection?` → `aliases?` → `column*` → `column-instance*` → `folders-common?` → `layout?` → `style?` → `datasource-dependencies*` → `filter*`

**Aliases before columns:** `<aliases>` must appear **before** any `<column>` elements. Putting `<aliases>` after columns triggers a content-model error (`element 'aliases' is not allowed`).

### Parameters pseudo-datasource

Parameters live in a datasource named `Parameters` with `hasconnection='false'` and `inline='true'`. See the [Parameters](#parameters) section.

### Data datasource example

```xml
<datasource caption='Sample - Superstore' inline='true' name='federated.xyz123' version='18.1'>
  <connection class='excel-direct' cleaning='no' compat='no'
              filename='/path/to/file.xlsx' validate='no'>
    <relation name='Orders$' table='[Orders$]' type='table'>
      <columns header='yes' outcome='6'>
        <column datatype='integer' name='Row ID' ordinal='0' />
        <column datatype='string' name='Order ID' ordinal='1' />
        <column datatype='date' name='Order Date' ordinal='2' />
        <column datatype='real' name='Sales' ordinal='3' />
      </columns>
    </relation>
    <metadata-records>
      <metadata-record class='column'>
        <remote-name>Order ID</remote-name>
        <remote-type>130</remote-type>
        <local-name>[Order ID]</local-name>
        <parent-name>[Orders$]</parent-name>
        <local-type>string</local-type>
        <aggregation>Count</aggregation>
        <contains-null>true</contains-null>
      </metadata-record>
    </metadata-records>
  </connection>
  <aliases enabled='yes' />

  <column caption='Profit Ratio' datatype='real' default-format='p0%'
          name='[Calculation_5571209093911105]' role='measure' type='quantitative'>
    <calculation class='tableau' formula='SUM([Profit])/SUM([Sales])' scope-isolation='false' />
  </column>

  <column datatype='string' name='[City]' role='dimension'
          semantic-role='[City].[Name]' type='nominal' />

  <column datatype='string' hidden='true' name='[Customer ID]' role='dimension' type='nominal' />
</datasource>
```

### Relation types

**Table:**

```xml
<relation name='Orders' table='[Orders$]' type='table'>
  <columns header='yes'>
    <column datatype='string' name='Field1' ordinal='0' />
  </columns>
</relation>
```

**Custom SQL:**

```xml
<relation name='Custom SQL Query' type='text'>
  SELECT * FROM orders WHERE status = 'active'
</relation>
```

**Join:**

```xml
<relation join='inner' type='join'>
  <clause type='join'>
    <expression op='='>
      <expression op='[Orders].[Customer ID]' />
      <expression op='[Customers].[ID]' />
    </expression>
  </clause>
  <relation name='Orders' table='[Orders]' type='table' />
  <relation name='Customers' table='[Customers]' type='table' />
</relation>
```

### Connection classes (common)

`excel-direct`, `textscan`, `hyper`, `sqlserver`, `postgres`, `mysql`, `redshift`, `snowflake`, `bigquery`, `databricks`, `oracle`, `sqlproxy`, `federated`, and others depending on connectors.

### `folders-common` (optional)

Groups fields in the Data pane. Placed after all `<column>` / `<column-instance>` definitions and before `<layout>` when used. See [calculated-fields-and-lod.md](calculated-fields-and-lod.md) for calc-heavy layouts. [programmatic-twb-learnings.md §13.8](programmatic-twb-learnings.md) notes folders can be omitted for simpler generated workbooks.

---

## Column/Field Attributes

| Attribute | Values | Description |
|-----------|--------|-------------|
| `datatype` | `string`, `integer`, `real`, `date`, `datetime`, `boolean`, … | Physical type |
| `role` | `dimension`, `measure` | Pane role |
| `type` | `quantitative`, `nominal`, `ordinal` | Semantic type |
| `caption` | string | Display label |
| `hidden` | `true`, `false` | Hide from UI |
| `default-format` | format string | Number/date display |
| `aggregation` | `Sum`, `Avg`, `Count`, `Min`, `Max`, `Median`, … | Default aggregation on the data source |
| `semantic-role` | geographic role string | e.g. `[City].[Name]`, `[Country].[ISO3166_2]` |
| `param-domain-type` | `any`, `list`, `range` | Parameter domain — see [Parameters](#parameters) |

---

## Column-Instance Naming

Column instances link a base `<column>` to shelf usage. Names encode derivation and discrete/continuous behavior.

**Fully qualified on shelves:**

```
[DatasourceName].[derivation:FieldName:suffix]
```

### Derivation prefixes

| Prefix | Meaning |
|--------|---------|
| `none:` | No aggregation (dimensions) |
| `sum:`, `avg:`, `cnt:`, `min:`, `max:`, `cntd:`, `attr:`, `med:` | Aggregations |
| `yr:`, `qr:`, `mn:`, `dy:`, `tyr:`, `tmn:` | Date parts / truncations |
| `usr:` | User/calculated field instance (see [programmatic-twb-learnings.md §12.1](programmatic-twb-learnings.md)) |

### Type suffixes

| Suffix | Meaning |
|--------|---------|
| `:nk` | Nominal key (discrete) |
| `:qk` | Quantitative key (continuous) |
| `:ok` | Ordinal key |

**Example:**

```xml
<column-instance column='[Sales]' derivation='Sum' name='[sum:Sales:qk]'
                pivot='key' type='quantitative' />
```

---

## Worksheets Section

### Worksheet and table ordering

- **Worksheet:** `layout-options?` → `table` → `simple-id` (required on worksheet — see [programmatic-twb-learnings.md §13.2](programmatic-twb-learnings.md)).
- **`<table>`:** `view` → `style` → `panes` → `rows` → `cols`.

**`<rows>` and `<cols>` are direct children of `<table>`**, placed after `<panes>`, never inside `<view>`. Inside `<view>` you typically have: `datasources`, `datasource-dependencies`, filters, `shelf-sorts?`, `slices?`, `aggregation`.

### Complete table skeleton

```xml
<worksheets>
  <worksheet name='Sales by Category'>
    <layout-options>
      <title><formatted-text>
        <run fontname='Tableau Medium' fontsize='11'>Title</run>
      </formatted-text></title>
    </layout-options>
    <table>
      <view>
        <datasources>
          <datasource caption='My Data' name='federated.xyz' />
        </datasources>
        <datasource-dependencies datasource='federated.xyz'>
          <column datatype='string' name='[Category]' role='dimension' type='nominal' />
          <column datatype='real' name='[Sales]' role='measure' type='quantitative' />
          <column-instance column='[Category]' derivation='None' name='[none:Category:nk]'
                          pivot='key' type='nominal' />
          <column-instance column='[Sales]' derivation='Sum' name='[sum:Sales:qk]'
                          pivot='key' type='quantitative' />
        </datasource-dependencies>
        <shelf-sorts>
          <shelf-sort-v2 dimension-to-sort='[federated.xyz].[none:Category:nk]'
                         direction='DESC' is-on-innermost-dimension='true'
                         measure-to-sort-by='[federated.xyz].[sum:Sales:qk]' shelf='rows' />
        </shelf-sorts>
        <aggregation value='true' />
      </view>
      <style>
        <style-rule element='axis'>
          <format attr='stroke-size' value='0' />
          <format attr='line-visibility' value='off' />
        </style-rule>
        <style-rule element='mark'>
          <format attr='mark-labels-show' value='true' />
          <format attr='mark-labels-cull' value='true' />
        </style-rule>
        <style-rule element='axis-title'>
          <format attr='display' value='off' />
        </style-rule>
      </style>
      <panes>
        <pane selection-relaxation-option='selection-relaxation-allow'>
          <view>
            <breakdown value='auto' />
          </view>
          <mark class='Bar' />
        </pane>
      </panes>
      <rows>[federated.xyz].[none:Category:nk]</rows>
      <cols>[federated.xyz].[sum:Sales:qk]</cols>
    </table>
    <simple-id uuid='{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}' />
  </worksheet>
</worksheets>
```

### Field syntax on shelves

Shelf XML text uses the fully qualified `[Datasource].[prefix:Field:suffix]` form shown above.

### Mark types

`<mark class='Bar' />` — common classes include `Automatic`, `Bar`, `Line`, `Area`, `Circle`, `Square`, `Text`, `Shape`, `Pie`, `Gantt Bar`, `Polygon`, `Map`, `Density`.

### Encodings

`<encodings>` can carry channels such as `color`, `size`, `text`, `lod`, `shape`, `tooltip`, each referencing `column='[datasource].[field]'`.

### Date fields in `datasource-dependencies`

For continuous date axes, use an **ordinal** column with a **quantitative** `column-instance` (see [programmatic-twb-learnings.md §13.3](programmatic-twb-learnings.md)):

```xml
<column datatype='date' name='[my_date]' role='dimension' type='ordinal' />
<column-instance column='[my_date]' derivation='None' name='[none:my_date:qk]'
                pivot='key' type='quantitative' />
```

---

## Parameters

Parameters live in the **`Parameters`** datasource (`hasconnection='false'`, `inline='true'`). See [filters-and-parameters.md](filters-and-parameters.md) for dashboard filter cards and parameter controls.

### `param-domain-type`

| Value | Meaning | Child elements |
|-------|---------|----------------|
| `any` | Unrestricted value (typical for “type-in” floats and parameter actions) | None |
| `list` | Enumerated domain | `<members>` only |
| `range` | Min/max (and optional `granularity` for numeric steps) | `<range>` only |

List and range domains are **mutually exclusive** for a single parameter: use `<members>` **or** `<range>`, not both.

### String encoding

String defaults and list members use XML entities, especially `&quot;` for double quotes in attribute values:

```xml
<column caption='Region Selector' datatype='string' name='[Parameter 2]'
        param-domain-type='list' role='dimension' type='nominal' value='&quot;East&quot;'>
  <calculation class='tableau' formula='&quot;East&quot;' />
  <members>
    <member alias='Eastern Region' value='&quot;East&quot;' />
    <member value='&quot;Central&quot;' />
  </members>
</column>
```

### Full Parameters datasource example

```xml
<datasource hasconnection='false' inline='true' name='Parameters' version='18.1'>
  <aliases enabled='yes' />

  <column caption='Top N' datatype='integer' name='[Parameter 1]'
          param-domain-type='range' role='measure' type='quantitative' value='10'>
    <calculation class='tableau' formula='10' />
    <range granularity='1' max='50' min='1' />
  </column>

  <column caption='Discount Rate' datatype='real' name='[Parameter 3]'
          param-domain-type='any' role='measure' type='quantitative' value='0.15'>
    <calculation class='tableau' formula='0.15' />
  </column>

  <column caption='Start Date' datatype='date' name='[Parameter 4]'
          param-domain-type='range' role='dimension' type='ordinal' value='#2024-01-01#'>
    <calculation class='tableau' formula='#2024-01-01#' />
    <range max='#2025-12-31#' min='#2020-01-01#' />
  </column>

  <column caption='Show Details' datatype='boolean' name='[Parameter 5]'
          param-domain-type='list' role='dimension' type='nominal' value='true'>
    <calculation class='tableau' formula='true' />
    <members>
      <member value='true' />
      <member value='false' />
    </members>
  </column>
</datasource>
```

### `range` element

Use `min` and `max` on `<range>`. For integers, `granularity` is valid. Declare only attributes that your Tableau version’s schema allows on `<range>` (see Tableau release notes for your build).

### Referencing parameters in calculations

```
[Parameters].[Parameter Name]
```

---

## Filters

Filters can appear on **datasources** (source filters), inside **worksheet** `<view>` (worksheet filters), and in **dashboard actions** (filter actions). Detailed patterns (Top N, context, slices, cards, relative dates) are in **[filters-and-parameters.md](filters-and-parameters.md)**.

### Categorical (examples)

**Include members:**

```xml
<filter class='categorical' column='[DatasourceName].[FieldName]'>
  <groupfilter function='member' level='[FieldName]' member='&quot;Value1&quot;' />
</filter>
```

**Union of members:**

```xml
<filter class='categorical' column='[DatasourceName].[Region]'>
  <groupfilter function='union'>
    <groupfilter function='member' level='[Region]' member='&quot;East&quot;' />
    <groupfilter function='member' level='[Region]' member='&quot;West&quot;' />
  </groupfilter>
</filter>
```

**Exclude:**

```xml
<filter class='categorical' column='[DatasourceName].[Region]'>
  <groupfilter function='except' user:ui-enumeration='exclusive'>
    <groupfilter function='level-members' level='[Region]' />
    <groupfilter function='union'>
      <groupfilter function='member' level='[Region]' member='&quot;South&quot;' />
    </groupfilter>
  </groupfilter>
</filter>
```

### Quantitative

```xml
<filter class='quantitative' column='[DatasourceName].[sum:Sales:qk]'>
  <min>1000</min>
  <max>50000</max>
</filter>
```

### Relative date

```xml
<filter class='relative-date' column='[DatasourceName].[Order Date]'
        first-period='-1' include-future='true' include-null='false'
        last-period='0' period-type='year' />
```

---

## Dashboard Containers

Dashboards use a **proportional coordinate system: `100000` = 100%** of the parent container (`x`, `y`, `w`, `h`). Root zone is typically `x='0' y='0' w='100000' h='100000'`. Full zone hierarchies, flow layouts, legends, and device layouts are documented in **[dashboard-layout-and-zones.md](dashboard-layout-and-zones.md)**.

### Example

```xml
<dashboards>
  <dashboard name='Main Dashboard'>
    <style />
    <size maxheight='900' maxwidth='1300' minheight='900' minwidth='1300' sizing-mode='fixed' />
    <zones>
      <zone h='100000' id='1' type-v2='layout-basic' w='100000' x='0' y='0'>
        <zone h='50000' id='2' name='Sales by Category' w='60000' x='0' y='0' />
        <zone h='50000' id='3' name='Profit Map' w='40000' x='60000' y='0' />
        <zone h='50000' id='4' type-v2='text' w='100000' x='0' y='50000'>
          <formatted-text>
            <run>Dashboard Title</run>
          </formatted-text>
        </zone>
      </zone>
    </zones>
    <devicelayouts>
      <devicelayout auto-generated='true' name='Phone' />
    </devicelayouts>
  </dashboard>
</dashboards>
```

### `type-v2` (generated TWBs)

For new or generated workbooks, prefer **`type-v2`** on zones. Older files sometimes use legacy **`type=`** alone; when both appear, treat **`type-v2`** as the primary classifier for automation.

| `type-v2` | Role |
|-----------|------|
| `layout-basic` | Root tiled container (single root per dashboard) |
| `layout-flow` | Flow layout — use `param='horz'` or `param='vert'` |
| `dashboard-object` | Dashboard-level object regions (titles, chrome) where used |
| `text` | Text — contains `<formatted-text>` |
| `paramctrl` | Parameter control — `param='[Parameters].[Name]'`, `mode` (`compact`, `radiolist`, `slider`, `typein`, …) |
| `filter` | Quick filter card |

Worksheet embeds often use **`name='Exact Worksheet Name'`** with no type (matches `<worksheet name='...'>`).

Other object types (image, web, legend, empty, color/size legends) appear in saved workbooks; see **[dashboard-layout-and-zones.md](dashboard-layout-and-zones.md)**.

### Zone children order

- **Worksheet zones:** `layout-cache?` → `zone-style?`
- **Containers:** child `zone`* → `zone-style?` (style last — see [programmatic-twb-learnings.md §13.12](programmatic-twb-learnings.md))

### Layout cache (worksheet zones)

Tableau may emit `<layout-cache>` under worksheet zones (cell vs scalable sizing). Example:

```xml
<zone name='Sales Sparkline' show-title='false'>
  <layout-cache minheight='100' minwidth='100' type-h='scalable' type-w='scalable' />
</zone>
```

### Fixed sizing

`is-fixed='true'` with `fixed-size='N'` expresses fixed pixel dimensions (e.g. title bars).

### Dynamic Zone Visibility

For DZV, zones and the datagraph must stay consistent; see [programmatic-twb-learnings.md §5e](programmatic-twb-learnings.md) and [dashboard-layout-and-zones.md](dashboard-layout-and-zones.md).

---

## Actions

Common dashboard/worksheet actions include **filter**, **highlight**, **URL**, **set**, and **parameter** interactions (commands such as `tsc:brush`, `tsc:highlight`, `tsc:url`, `tsc:set`, `tsc:param`, `tsc:goto-sheet`).

### `edit-parameter-action` name brackets

The `name` attribute on `<edit-parameter-action>` must use **bracket notation** matching Tableau’s pattern (e.g. `name='[Set Sales]'`). See [programmatic-twb-learnings.md §25.1](programmatic-twb-learnings.md).

```xml
<edit-parameter-action caption='Set Sales' name='[Set Sales]'>
  <!-- action body -->
</edit-parameter-action>
```

---

## Windows Section

The `<windows>` block defines Desktop layout per sheet. **It must be fully populated** — empty `<cards />` or empty `<viewpoints />` cause internal errors (**2805CF18**). See [programmatic-twb-learnings.md §13.1](programmatic-twb-learnings.md).

### Dashboard window

```xml
<window class='dashboard' maximized='true' name='My Dashboard'>
  <viewpoints>
    <viewpoint name='Sheet 1'><zoom type='entire-view' /></viewpoint>
    <viewpoint name='Sheet 2'><zoom type='entire-view' /></viewpoint>
  </viewpoints>
  <active id='-1' />
</window>
```

### Worksheet window

```xml
<window class='worksheet' name='Sheet 1'>
  <cards>
    <edge name='left'>
      <strip size='160'>
        <card type='pages' /><card type='filters' /><card type='marks' />
      </strip>
    </edge>
    <edge name='top'>
      <strip size='2147483647'><card type='columns' /></strip>
      <strip size='2147483647'><card type='rows' /></strip>
      <strip size='31'><card type='title' /></strip>
    </edge>
  </cards>
  <viewpoint><zoom type='entire-view' /></viewpoint>
</window>
```

Viewpoint `name` values must match embedded worksheet names. Omit manual `<simple-id>` inside `<window>` during generation ([programmatic-twb-learnings.md §13.6](programmatic-twb-learnings.md)).

---

## Metadata Records

Optional under `<connection>`; Tableau can regenerate metadata on open. When present, `<remote-type>` values align with internal ODBC/federated typing.

### Type code reference

| Code | Type | Context |
|------|------|---------|
| 130 | string | Tableau internal |
| 5 | real | Tableau internal |
| 7 | date | Tableau internal |
| 20 | integer | Tableau internal |
| 12 | SQL_VARCHAR | ODBC federated metadata |
| -1 | calculated measure | Calculated columns in metadata |

Example:

```xml
<metadata-record class='column'>
  <remote-name>Sales</remote-name>
  <remote-type>5</remote-type>
  <local-name>[Sales]</local-name>
  <parent-name>[Orders$]</parent-name>
  <remote-alias>Sales</remote-alias>
  <ordinal>17</ordinal>
  <local-type>real</local-type>
  <aggregation>Sum</aggregation>
  <precision>15</precision>
  <contains-null>true</contains-null>
  <attributes>
    <attribute datatype='string' name='DebugRemoteType'>"R8"</attribute>
  </attributes>
</metadata-record>
```

---

## Groups, Bins, Sets

### Groups

```xml
<column caption='Region Group' datatype='string' name='[Region (group)]' role='dimension' type='nominal'>
  <calculation class='categorical-bin' column='[Region]'>
    <bin value='"Northeast"'>
      <value>"Connecticut"</value>
      <value>"Massachusetts"</value>
      <value>"New York"</value>
    </bin>
    <bin value='"Southeast"'>
      <value>"Florida"</value>
      <value>"Georgia"</value>
    </bin>
  </calculation>
</column>
```

### Bins

```xml
<column caption='Profit (bin)' datatype='integer' name='[Profit (bin)]' role='dimension' type='ordinal'>
  <calculation class='bin' decimals='0' formula='[Profit]' peg='0' size='100' />
</column>
```

### Sets

```xml
<column caption='Top Customers' datatype='string' name='[Top Customers Set]' role='dimension' type='nominal'>
  <calculation class='set' formula='INDEX() &lt;= [Parameters].[Top N]'>
    <set-spec>
      <set-field>[Customer Name]</set-field>
      <sort>
        <sort-field direction='DESC' field='[sum:Sales:qk]' />
      </sort>
    </set-spec>
  </calculation>
</column>
```

---

## External Shapes (Workbook-level)

Custom shape palettes can be embedded as base64 under a direct child of `<workbook>` (after `<datagraph>` when present):

```xml
<external>
  <shapes>
    <shape name='Arrows/1-1.png'>
      iVBORw0KGgo...base64 encoded PNG...
    </shape>
    <shape name='Arrows/1-4.png'>
      iVBORw0KGgo...base64 encoded PNG...
    </shape>
  </shapes>
</external>
```

The `name` is relative to the Tableau Shapes repository folder. Embed whole palette folders if needed; wrap base64 at ~76 characters per line for readability.

---

## Minimal Viable Workbook Template

A loadable `.twb` generally includes:

- `<workbook>` with `xmlns:user`, `source-build`, `version`
- `<document-format-change-manifest>` with `ObjectModelEncapsulateLegacy`
- `<preferences />`
- `<datasources>` — at least one data source (and `Parameters` if any parameters)
- `<worksheets>` — one worksheet with `<table>` → `<view>`, `<datasource-dependencies>`, `<panes>`, `<rows>`, `<cols>`, plus `<simple-id>`
- `<dashboards>` — optional but typical for dashboards; root zone + worksheet zones
- `<windows>` — populated dashboard and worksheet windows

```xml
<?xml version='1.0' encoding='utf-8' ?>
<workbook source-platform='win' source-build='2024.1.0 (20241.24.0312.1315)' version='18.1'
          locale='en_US' xmlns:user='http://www.tableausoftware.com/xml/user'>
  <document-format-change-manifest>
    <_.fcp.ObjectModelEncapsulateLegacy.true...ObjectModelEncapsulateLegacy />
  </document-format-change-manifest>
  <preferences />
  <datasources>
    <datasource hasconnection='false' inline='true' name='Parameters' version='18.1'>
      <aliases enabled='yes' />
    </datasource>
    <!-- Add federated or file connection + columns here -->
  </datasources>
  <worksheets>
    <worksheet name='Sheet 1'>
      <table>
        <view>
          <datasources><datasource name='federated.001' /></datasources>
          <datasource-dependencies datasource='federated.001'>
            <!-- columns + column-instances -->
          </datasource-dependencies>
          <aggregation value='true' />
        </view>
        <style />
        <panes>
          <pane selection-relaxation-option='selection-relaxation-allow'>
            <view><breakdown value='auto' /></view>
            <mark class='Bar' />
          </pane>
        </panes>
        <rows></rows>
        <cols></cols>
      </table>
      <simple-id uuid='{00000000-0000-4000-8000-000000000001}' />
    </worksheet>
  </worksheets>
  <dashboards />
  <windows>
    <window class='worksheet' name='Sheet 1'>
      <cards>
        <edge name='left'>
          <strip size='160'>
            <card type='pages' /><card type='filters' /><card type='marks' />
          </strip>
        </edge>
        <edge name='top'>
          <strip size='2147483647'><card type='columns' /></strip>
          <strip size='2147483647'><card type='rows' /></strip>
          <strip size='31'><card type='title' /></strip>
        </edge>
      </cards>
      <viewpoint><zoom type='entire-view' /></viewpoint>
    </window>
  </windows>
</workbook>
```

Replace placeholder datasource and shelf content with real `<column>` / `<column-instance>` definitions and qualified `[ds].[field]` references on `<rows>` and `<cols>` (empty shelves may not open). Add matching `windows` entries for every sheet and dashboard you reference.

---

## Generation Best Practices

- Declare `xmlns:user='http://www.tableausoftware.com/xml/user'` on the root workbook.
- Encode string literals in XML attributes with `&quot;` where Tableau expects quoted strings.
- Provide `<datasource-dependencies>` for every field used on shelves, filters, and marks.
- Use unique integer `id` values for zones; anchor the root layout at `0,0` with `w='100000'` `h='100000'`.
- Keep `<table>` child order: `view` → `style` → `panes` → `rows` → `cols`; keep `<rows>`/`<cols>` on `<table>`.
- Include a complete `<windows>` section with populated `<cards>` and `<viewpoints>`.
- Validate generated `.twb` files by opening in Tableau Desktop; iterate on schema messages as needed.
- Prefer prototyping in Desktop, saving a `.twb`, then templating — see [programmatic-twb-learnings.md §8–§9, §13](programmatic-twb-learnings.md).

For exhaustive error codes and fixes, see **[error-codes-and-pitfalls.md](error-codes-and-pitfalls.md)**. For LOD and calculation XML patterns, see **[calculated-fields-and-lod.md](calculated-fields-and-lod.md)**.
