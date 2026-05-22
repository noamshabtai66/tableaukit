# Tableau Visualization Types and Chart Patterns

Authoritative chart-type reference for Tableau TWB XML. Element order for `<table>` follows [xml-schema-and-structure.md](xml-schema-and-structure.md).

**Related references:** [kpi-cards-and-trends.md](kpi-cards-and-trends.md) (BAN and KPI card layouts), [programmatic-twb-learnings.md](programmatic-twb-learnings.md) (validated dual-axis, heatmap, and Measure Names patterns), [error-codes-and-pitfalls.md](error-codes-and-pitfalls.md) (load errors and invalid elements).

---

## Canonical `<table>` structure

`<rows>` and `<cols>` are **direct children of `<table>`**, after `<view>`, `<style>`, and `<panes>`. Do **not** nest `<rows>` / `<cols>` inside `<view>`.

```xml
<table>
  <view>
    <datasources>...</datasources>
    <datasource-dependencies>...</datasource-dependencies>
    <aggregation value='true' />
  </view>
  <style>...</style>
  <panes>...</panes>
  <rows>[DS].[field]</rows>
  <cols>[DS].[field]</cols>
</table>
```

---

## Mark Types

```xml
<mark class='TYPE' />
```

| Mark Type | Use Case |
|-----------|----------|
| `Automatic` | Let Tableau decide (maps, mixed types) |
| `Bar` | Categorical comparisons |
| `Line` | Trends over time |
| `Area` | Cumulative trends, sparkline fill |
| `Square` | Heat maps, treemaps |
| `Circle` | Scatter plots |
| `Shape` | KPI trend indicators, categorical scatter — see [shapes-kpi-trend-indicators.md](shapes-kpi-trend-indicators.md) |
| `Text` | Cross-tabs, text tables, KPI cards |
| `Map` | Geographic data |
| `Pie` | Part-to-whole |
| `Gantt` | Timeline / duration |
| `Polygon` | Custom geographic or path shapes |
| `Density` | Heat density |

---

## Bar Chart

**Pattern:** Dimension on one shelf, measure on the other; `mark class='Bar'`. Swap `<rows>` and `<cols>` for horizontal vs vertical.

```xml
<worksheet name='Sales by Category'>
  <table>
    <view>
      <datasources>
        <datasource name='Sample - Superstore' />
      </datasources>
      <datasource-dependencies datasource='Sample - Superstore'>
        <column datatype='string' name='[Category]' role='dimension' type='nominal' />
        <column datatype='real' name='[Sales]' role='measure' type='quantitative' />
        <column-instance column='[Category]' derivation='None'
                        name='[none:Category:nk]' pivot='key' type='nominal' />
        <column-instance column='[Sales]' derivation='Sum'
                        name='[sum:Sales:qk]' pivot='key' type='quantitative' />
      </datasource-dependencies>
    </view>
    <style>
      <style-rule element='mark'>
        <mark class='Bar' />
      </style-rule>
    </style>
    <panes>
      <pane>
        <mark class='Bar' />
      </pane>
    </panes>
    <rows>[Sample - Superstore].[none:Category:nk]</rows>
    <cols>[Sample - Superstore].[sum:Sales:qk]</cols>
  </table>
</worksheet>
```

### Vertical bar

Swap shelves: put the measure on `<rows>` and the dimension on `<cols>` (or the reverse of the horizontal example above).

### Stacked bar

Add `<color>` on the pane (and optionally `<text>` for labels):

```xml
<panes>
  <pane>
    <mark class='Bar' />
    <encodings>
      <color column='[Sample - Superstore].[none:Segment:nk]' />
    </encodings>
  </pane>
</panes>
```

### Production bar (KPI Tracking — labels, color, tooltips)

```xml
<worksheet name='Revenue by Product'>
  <table>
    <view>
      <datasource-dependencies datasource='sqlproxy.0xloa3o1j494z91a039qy0nm99ru'>
        <column-instance column='[product_name]' derivation='None'
                        name='[none:product_name:nk]' pivot='key' type='nominal' />
        <column-instance column='[usd_net_total]' derivation='Sum'
                        name='[sum:usd_net_total:qk]' pivot='key' type='quantitative' />
        <column-instance column='[order_action]' derivation='None'
                        name='[none:order_action:nk]' pivot='key' type='nominal' />
      </datasource-dependencies>
      <aggregation value='true' />
    </view>
    <style>
      <style-rule element='mark'>
        <format attr='mark-labels-show' value='true' />
        <format attr='mark-labels-cull' value='true' />
        <format attr='mark-labels-mode' value='range' />
      </style-rule>
    </style>
    <panes>
      <pane id='1' selection-relaxation-option='selection-relaxation-allow'>
        <view>
          <breakdown value='auto' />
        </view>
        <mark class='Bar' />
        <encodings>
          <color column='[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[none:order_action:nk]' />
          <text column='[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[sum:usd_net_total:qk]' />
        </encodings>
        <customized-tooltip>
          <formatted-text>
            <run fontcolor='#757575'>Product:&#9;</run>
            <run bold='true'><![CDATA[<[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[none:product_name:nk]>]]></run>
            <run>Æ&#10;</run>
            <run fontcolor='#757575'>Revenue:&#9;</run>
            <run bold='true'><![CDATA[<[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[sum:usd_net_total:qk]>]]></run>
          </formatted-text>
        </customized-tooltip>
        <customized-label>
          <formatted-text>
            <run><![CDATA[<[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[sum:usd_net_total:qk]>]]></run>
          </formatted-text>
        </customized-label>
      </pane>
    </panes>
    <rows>[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[sum:usd_net_total:qk]</rows>
    <cols>[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[none:product_name:nk]</cols>
  </table>
</worksheet>
```

**Notes:** `<text>` = bar labels; `<color>` = stack/group; `mark-labels-mode='range'` fits bar labels.

---

## Line Chart

**Time series:** continuous or discrete date on `<cols>`, measure on `<rows>` (typical). `mark class='Line'`.

```xml
<worksheet name='Sales Trend'>
  <table>
    <view>
      <datasource-dependencies datasource='Sample - Superstore'>
        <column datatype='date' name='[Order Date]' role='dimension' type='quantitative' />
        <column datatype='real' name='[Sales]' role='measure' type='quantitative' />
        <column-instance column='[Order Date]' derivation='Month-Trunc'
                        name='[tmn:Order Date:qk]' pivot='key' type='quantitative' />
        <column-instance column='[Sales]' derivation='Sum'
                        name='[sum:Sales:qk]' pivot='key' type='quantitative' />
      </datasource-dependencies>
    </view>
    <style>
      <style-rule element='mark'>
        <mark class='Line' />
      </style-rule>
    </style>
    <panes>
      <pane>
        <mark class='Line' />
      </pane>
    </panes>
    <rows>[Sample - Superstore].[sum:Sales:qk]</rows>
    <cols>[Sample - Superstore].[tmn:Order Date:qk]</cols>
  </table>
</worksheet>
```

### Date derivations (column-instance prefixes)

| Prefix | Meaning |
|--------|---------|
| `yr:` | Year (discrete) |
| `qr:` | Quarter (discrete) |
| `mn:` | Month (discrete) |
| `dy:` | Day (discrete) |
| `tmn:` | Month truncation (continuous) |
| `tqr:` | Quarter truncation (continuous) |
| `tyr:` | Year truncation (continuous) |

### Multi-line

Add `<color column='[DS].[none:Category:nk]' />` in `<encodings>`.

### Production line (KPI Tracking — color, tooltip, line-end labels)

```xml
<worksheet name='Orders YOY'>
  <table>
    <view>
      <datasource-dependencies datasource='sqlproxy.0xloa3o1j494z91a039qy0nm99ru'>
        <column-instance column='[Dynamic Period]' derivation='None'
                        name='[none:Dynamic Period:ok]' pivot='key' type='ordinal' />
        <column-instance column='[Gross Orders]' derivation='User'
                        name='[usr:Gross Orders:qk]' pivot='key' type='quantitative' />
        <column-instance column='[YOY Growth]' derivation='User'
                        name='[usr:YOY Growth:qk:1]' pivot='key' type='quantitative'>
          <table-calc ordering-field='[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[year]'
                      ordering-type='Field' />
        </column-instance>
        <column-instance column='[year]' derivation='None'
                        name='[none:year:ok]' pivot='key' type='ordinal' />
      </datasource-dependencies>
      <aggregation value='true' />
    </view>
    <style>
      <style-rule element='mark'>
        <format attr='mark-labels-line-first' value='true' />
        <format attr='mark-labels-show' value='true' />
        <format attr='mark-labels-mode' value='line-ends' />
        <format attr='mark-labels-cull' value='true' />
      </style-rule>
    </style>
    <panes>
      <pane id='1' selection-relaxation-option='selection-relaxation-allow'>
        <view>
          <breakdown value='auto' />
        </view>
        <mark class='Line' />
        <encodings>
          <color column='[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[none:year:ok]' />
          <tooltip column='[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:YOY Growth:qk:1]' />
        </encodings>
        <customized-tooltip>
          <formatted-text>
            <run fontcolor='#757575'>Dynamic Period:&#9;</run>
            <run bold='true'><![CDATA[<[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[none:Dynamic Period:ok]>]]></run>
            <run>Æ&#10;</run>
            <run fontcolor='#757575'>Year:&#9;</run>
            <run bold='true'><![CDATA[<[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[none:year:ok]>]]></run>
            <run>Æ&#10;</run>
            <run fontcolor='#757575'>Gross Orders:&#9;</run>
            <run bold='true'><![CDATA[<[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:Gross Orders:qk]>]]></run>
            <run>Æ&#10;</run>
            <run fontcolor='#757575'>YOY Growth:&#9;</run>
            <run bold='true'><![CDATA[<[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:YOY Growth:qk:1]>]]></run>
          </formatted-text>
        </customized-tooltip>
      </pane>
    </panes>
    <rows>[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:Gross Orders:qk]</rows>
    <cols>[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[none:Dynamic Period:ok]</cols>
  </table>
</worksheet>
```

---

## Area Chart

Solid or stacked area uses `mark class='Area'` (same shelf pattern as line). Stacked area: add `<color>` by dimension.

```xml
<style>
  <style-rule element='mark'>
    <mark class='Area' />
  </style-rule>
</style>
<panes>
  <pane>
    <mark class='Area' />
    <encodings>
      <color column='[Sample - Superstore].[none:Category:nk]' />
    </encodings>
  </pane>
</panes>
```

Pair with `<rows>` / `<cols>` at `<table>` level as in the line chart. For sparkline-style line + area overlay, see **Dual Axis Chart** (blended `(A + A)` pattern) and [programmatic-twb-learnings.md §24.3](programmatic-twb-learnings.md).

---

## Scatter Plot

Two measures on shelves; `mark class='Circle'`. Optional `<color>`, `<size>`, `<lod>`, `<text>`, `<tooltip>`.

```xml
<worksheet name='Sales vs Profit'>
  <table>
    <view>
      <datasource-dependencies datasource='Sample - Superstore'>
        <column-instance column='[Sales]' derivation='Sum'
                        name='[sum:Sales:qk]' pivot='key' type='quantitative' />
        <column-instance column='[Profit]' derivation='Sum'
                        name='[sum:Profit:qk]' pivot='key' type='quantitative' />
        <column-instance column='[Category]' derivation='None'
                        name='[none:Category:nk]' pivot='key' type='nominal' />
      </datasource-dependencies>
    </view>
    <style>
      <style-rule element='mark'>
        <mark class='Circle' />
      </style-rule>
    </style>
    <panes>
      <pane>
        <mark class='Circle' />
        <encodings>
          <color column='[Sample - Superstore].[none:Category:nk]' />
          <size column='[Sample - Superstore].[sum:Quantity:qk]' />
          <lod column='[Sample - Superstore].[none:Sub-Category:nk]' />
        </encodings>
      </pane>
    </panes>
    <rows>[Sample - Superstore].[sum:Profit:qk]</rows>
    <cols>[Sample - Superstore].[sum:Sales:qk]</cols>
  </table>
</worksheet>
```

---

## Pie Chart

**Angle encoding:** measure on `<size>` and `<wedge-size>`; dimension on `<color>`. Often uses empty `<rows />` and `<cols />` with all encodings in the pane.

```xml
<worksheet name='Sales by Segment'>
  <table>
    <view>
      <datasource-dependencies datasource='Sample - Superstore'>
        <column-instance column='[Segment]' derivation='None' name='[none:Segment:nk]' pivot='key' type='nominal' />
        <column-instance column='[Sales]' derivation='Sum' name='[sum:Sales:qk]' pivot='key' type='quantitative' />
      </datasource-dependencies>
    </view>
    <style>
      <style-rule element='mark'>
        <mark class='Pie' />
      </style-rule>
    </style>
    <panes>
      <pane>
        <mark class='Pie' />
        <encodings>
          <color column='[Sample - Superstore].[none:Segment:nk]' />
          <size column='[Sample - Superstore].[sum:Sales:qk]' />
          <wedge-size column='[Sample - Superstore].[sum:Sales:qk]' />
        </encodings>
      </pane>
    </panes>
    <rows></rows>
    <cols></cols>
  </table>
</worksheet>
```

---

## Heat Map / Highlight Table

**Square marks:** one dimension on `<rows>`, one on `<cols>`; color encodes the measure. For **uniform cell size**, add a dummy measure (e.g. `AVG(1)`) to rows/columns per [programmatic-twb-learnings.md §24.5](programmatic-twb-learnings.md) and set **`size='1.0'`** in mark style so squares fill the cell.

```xml
<style-rule element='mark'>
  <format attr='size' value='1.0' />
</style-rule>
```

Basic heat map:

```xml
<worksheet name='Sales Heat Map'>
  <table>
    <view>
      <datasource-dependencies datasource='Sample - Superstore'>
        <column-instance column='[Category]' derivation='None' name='[none:Category:nk]' pivot='key' type='nominal' />
        <column-instance column='[Region]' derivation='None' name='[none:Region:nk]' pivot='key' type='nominal' />
        <column-instance column='[Sales]' derivation='Sum' name='[sum:Sales:qk]' pivot='key' type='quantitative' />
      </datasource-dependencies>
    </view>
    <style>
      <style-rule element='mark'>
        <mark class='Square' />
      </style-rule>
    </style>
    <panes>
      <pane>
        <mark class='Square' />
        <encodings>
          <color column='[Sample - Superstore].[sum:Sales:qk]' />
          <text column='[Sample - Superstore].[sum:Sales:qk]' />
        </encodings>
      </pane>
    </panes>
    <rows>[Sample - Superstore].[none:Category:nk]</rows>
    <cols>[Sample - Superstore].[none:Region:nk]</cols>
  </table>
</worksheet>
```

### Production heat map (KPI Tracking — Upgrade Matrix)

```xml
<worksheet name='Upgrade Matrix'>
  <table>
    <view>
      <datasource-dependencies datasource='sqlproxy.0xloa3o1j494z91a039qy0nm99ru'>
        <column-instance column='[previous_plan_name]' derivation='None'
                        name='[none:previous_plan_name:nk]' pivot='key' type='nominal' />
        <column-instance column='[plan_name]' derivation='None'
                        name='[none:plan_name:nk]' pivot='key' type='nominal' />
        <column-instance column='[upgrade_value]' derivation='User'
                        name='[usr:upgrade_value:qk]' pivot='key' type='quantitative' />
        <column-instance column='[upgrade_count]' derivation='User'
                        name='[usr:upgrade_count:ok]' pivot='key' type='quantitative' />
      </datasource-dependencies>
      <aggregation value='true' />
    </view>
    <style>
      <style-rule element='mark'>
        <format attr='mark-labels-show' value='true' />
        <format attr='mark-labels-cull' value='true' />
      </style-rule>
    </style>
    <panes>
      <pane selection-relaxation-option='selection-relaxation-allow'>
        <view>
          <breakdown value='auto' />
        </view>
        <mark class='Square' />
        <encodings>
          <color column='[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:upgrade_value:qk]' />
          <text column='[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:upgrade_count:ok]' />
          <text column='[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:upgrade_value:ok]' />
        </encodings>
        <customized-label>
          <formatted-text>
            <run fontalignment='1'>$</run>
            <run fontalignment='1'><![CDATA[<[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:upgrade_value:ok]>]]></run>
            <run fontalignment='1'>Æ&#10;</run>
            <run fontalignment='1'>(</run>
            <run fontalignment='1'><![CDATA[<[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:upgrade_count:ok]>]]></run>
            <run fontalignment='1'>)</run>
          </formatted-text>
        </customized-label>
      </pane>
    </panes>
    <rows>[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[none:previous_plan_name:nk]</rows>
    <cols>[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[none:plan_name:nk]</cols>
  </table>
</worksheet>
```

### Performance heatmap with interpolated diverging color (VALIDATED)

For heatmaps where cells represent a ratio (e.g. Run Rate vs Goal), use an **interpolated diverging palette** directly on the measure instead of a discrete Color Tier field. This gives a smooth gradient (red → gold → green) rather than hard-coded tiers.

**Table-level style** — define color and size-bar encodings in the `<style-rule element="mark">`:

```xml
<style-rule element="mark">
  <encoding attr="size-bar" field="[ds].[usr:RunRateVsGoal:qk]"
            field-type="quantitative" max-size="1" min-size="0.005"
            type="centersize" />
  <encoding attr="color" field="[ds].[usr:RunRateVsGoal:qk]"
            max="1.3" min="0.0"
            palette="red_green_gold_diverging_10_0"
            type="interpolated" />
</style-rule>
```

**Pane encodings** — color and text both on the same measure:

```xml
<pane selection-relaxation-option="selection-relaxation-allow">
  <view><breakdown value="auto" /></view>
  <mark class="Square" />
  <encodings>
    <color column="[ds].[usr:RunRateVsGoal:qk]" />
    <text column="[ds].[usr:RunRateVsGoal:qk]" />
  </encodings>
  <style>
    <style-rule element="mark">
      <format attr="has-stroke" value="false" />
      <format attr="mark-labels-show" value="true" />
      <format attr="mark-labels-cull" value="true" />
      <format attr="mark-labels-line-first" value="true" />
      <format attr="mark-labels-line-last" value="true" />
      <format attr="mark-labels-range-min" value="true" />
      <format attr="mark-labels-range-max" value="true" />
      <format attr="mark-labels-mode" value="all" />
      <format attr="mark-labels-range-scope" value="pane" />
      <format attr="mark-labels-range-field" value="" />
    </style-rule>
  </style>
</pane>
```

**Key differences from discrete palette heatmap:**

| Aspect | Discrete (Color Tier) | Interpolated (Diverging) |
|--------|----------------------|--------------------------|
| Color field | Separate string calc (e.g. Color Tier) | Same measure as the value |
| Encoding type | `type="palette"` with `<map>` buckets | `type="interpolated"` with `min`/`max` |
| Gradient | Hard-coded tiers (Exceeds/Good/OK/Warn/Bad) | Smooth gradient from palette |
| Size-bar | Not used | `type="centersize"` fills cells proportionally |
| Stroke | Default (visible) | `has-stroke="false"` for cleaner cells |

**Palette options:** `red_green_gold_diverging_10_0` is a red-gold-green diverging palette suitable for performance metrics. Other useful diverging palettes: `orange_blue_diverging_10_0`, `red_blue_diverging_10_0`.

**`min`/`max` values:** Set to match the metric range. For Run Rate vs Goal where 1.0 = 100%, use `min="0.0" max="1.3"` so values above 100% still show gradient variation.

### Heatmap product/metric filtering patterns (VALIDATED)

**Exclude-based product filter** — when most products should show, exclude the unwanted ones:

```xml
<filter class="categorical" column="[ds].[none:product_name:nk]">
  <groupfilter function="except" user:ui-domain="relevant"
               user:ui-enumeration="exclusive" user:ui-marker="enumerate">
    <groupfilter function="level-members" level="[none:product_name:nk]" />
    <groupfilter function="union">
      <groupfilter function="member" level="[none:product_name:nk]" member="&quot;Care&quot;" />
      <groupfilter function="member" level="[none:product_name:nk]" member="&quot;Domain&quot;" />
    </groupfilter>
  </groupfilter>
</filter>
```

**Manual sort** — control row/column order with `<manual-sort>` and `<dictionary>`:

```xml
<manual-sort column="[ds].[none:product_name:nk]" direction="ASC">
  <dictionary>
    <bucket>&quot;All Products&quot;</bucket>
    <bucket>&quot;Plugin&quot;</bucket>
    <bucket>&quot;Hosting&quot;</bucket>
  </dictionary>
</manual-sort>
```

Note: `<manual-sort>` is valid in Desktop-saved files. For initial generated TWBs, use filter member order as a fallback if `<manual-sort>` causes D2E8DA72 errors (see [error-codes-and-pitfalls.md](error-codes-and-pitfalls.md)).

---

## Text Table (Crosstab)

`mark class='Text'` or `Automatic` with text encodings; measure values on `<text>`.

```xml
<worksheet name='Sales Table'>
  <table>
    <view>
      <datasource-dependencies datasource='Sample - Superstore'>
        <column-instance column='[Category]' derivation='None' name='[none:Category:nk]' pivot='key' type='nominal' />
        <column-instance column='[Region]' derivation='None' name='[none:Region:nk]' pivot='key' type='nominal' />
        <column-instance column='[Sales]' derivation='Sum' name='[sum:Sales:qk]' pivot='key' type='quantitative' />
      </datasource-dependencies>
    </view>
    <style>
      <style-rule element='mark'>
        <mark class='Text' />
      </style-rule>
    </style>
    <panes>
      <pane>
        <mark class='Text' />
        <encodings>
          <text column='[Sample - Superstore].[sum:Sales:qk]' />
        </encodings>
      </pane>
    </panes>
    <rows>[Sample - Superstore].[none:Category:nk]</rows>
    <cols>[Sample - Superstore].[none:Region:nk]</cols>
  </table>
</worksheet>
```

---

## KPI Card

**Text mark** with **empty** `<rows />` and `<cols />`; primary value on `<text>`, optional `<tooltip>`, `<customized-label>`, `<customized-tooltip>`.

For full BAN layouts, sparkline pairing, and navigation patterns, see **[kpi-cards-and-trends.md](kpi-cards-and-trends.md)**.

```xml
<worksheet name='AOV KPI'>
  <table>
    <view>
      <datasources>
        <datasource caption='Revenue view (Databricks)' name='sqlproxy.0xloa3o1j494z91a039qy0nm99ru' />
      </datasources>
      <datasource-dependencies datasource='sqlproxy.0xloa3o1j494z91a039qy0nm99ru'>
        <column aggregation='User' caption='AOV' datatype='real' default-type='quantitative'
                name='[AOV]' role='measure' type='quantitative' user-datatype='real'>
          <calculation class='tableau' formula='SUM([usd_net_total]) / COUNTD([order_id])' />
        </column>
        <column-instance column='[AOV]' derivation='User' name='[usr:AOV:qk]'
                         pivot='key' type='quantitative' />
      </datasource-dependencies>
      <aggregation value='true' />
    </view>
    <style>
      <style-rule element='mark'>
        <format attr='mark-labels-show' value='true' />
        <format attr='mark-labels-cull' value='true' />
        <format attr='mark-color' value='#b4b4b4' />
      </style-rule>
    </style>
    <panes>
      <pane selection-relaxation-option='selection-relaxation-allow'>
        <view>
          <breakdown value='auto' />
        </view>
        <mark class='Text' />
        <encodings>
          <text column='[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:AOV:qk]' />
          <tooltip column='[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:Total Revenue:qk]' />
        </encodings>
        <customized-tooltip>
          <formatted-text>
            <run fontcolor='#757575'>AOV:&#9;</run>
            <run bold='true'><![CDATA[<[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:AOV:qk]>]]></run>
            <run>Æ&#10;</run>
            <run fontcolor='#757575'>Total Revenue:&#9;</run>
            <run bold='true'><![CDATA[<[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:Total Revenue:qk]>]]></run>
          </formatted-text>
        </customized-tooltip>
        <customized-label>
          <formatted-text>
            <run bold='true' fontalignment='0' fontsize='15'>AOV</run>
            <run fontalignment='0'>Æ&#10;</run>
            <run bold='true' fontalignment='0' fontname='Tableau Book' fontsize='15'>
              <![CDATA[<[sqlproxy.0xloa3o1j494z91a039qy0nm99ru].[usr:AOV:qk]>]]>
            </run>
          </formatted-text>
        </customized-label>
      </pane>
    </panes>
    <rows />
    <cols />
  </table>
</worksheet>
```

---

## Map

Geographic roles on columns (`semantic-role`), lat/long on shelves, `mark` Automatic or Map; map layers under `<style-rule element='map'>`.

```xml
<worksheet name='Sales Map'>
  <table>
    <view>
      <datasource-dependencies datasource='Sample - Superstore'>
        <column datatype='string' name='[State]' role='dimension'
                semantic-role='[State].[Name]' type='nominal' />
        <column datatype='real' name='[Latitude (generated)]' role='measure'
                semantic-role='[Geographical].[Latitude]' type='quantitative' />
        <column datatype='real' name='[Longitude (generated)]' role='measure'
                semantic-role='[Geographical].[Longitude]' type='quantitative' />
      </datasource-dependencies>
    </view>
    <style>
      <style-rule element='mark'>
        <mark class='Automatic' />
      </style-rule>
      <style-rule element='map'>
        <map-style>
          <tiles enabled='true' />
        </map-style>
      </style-rule>
    </style>
    <panes>
      <pane>
        <mark class='Automatic' />
        <encodings>
          <lod column='[Sample - Superstore].[none:State:nk]' />
          <color column='[Sample - Superstore].[sum:Sales:qk]' />
          <size column='[Sample - Superstore].[sum:Profit:qk]' />
        </encodings>
      </pane>
    </panes>
    <rows>[Sample - Superstore].[avg:Latitude (generated):qk]</rows>
    <cols>[Sample - Superstore].[avg:Longitude (generated):qk]</cols>
  </table>
</worksheet>
```

**Common semantic roles:** `[State].[Name]`, `[City].[Name]`, `[Country].[Name]`, `[Country].[ISO3166_2]`, `[ZipCode].[Name]`, `[Geographical].[Latitude]`, `[Geographical].[Longitude]`.

---

## Gantt Chart

`mark class='Gantt'`; start on one shelf, **`<size>`** encodes duration.

```xml
<worksheet name='Project Timeline'>
  <table>
    <view>
      <datasource-dependencies datasource='Projects'>
        <column-instance column='[Task]' derivation='None' name='[none:Task:nk]' pivot='key' type='nominal' />
        <column-instance column='[Start Date]' derivation='None' name='[none:Start Date:qk]' pivot='key' type='quantitative' />
        <column-instance column='[Duration]' derivation='Sum' name='[sum:Duration:qk]' pivot='key' type='quantitative' />
      </datasource-dependencies>
    </view>
    <style>
      <style-rule element='mark'>
        <mark class='Gantt' />
      </style-rule>
    </style>
    <panes>
      <pane>
        <mark class='Gantt' />
        <encodings>
          <size column='[Projects].[sum:Duration:qk]' />
          <color column='[Projects].[none:Status:nk]' />
        </encodings>
      </pane>
    </panes>
    <rows>[Projects].[none:Task:nk]</rows>
    <cols>[Projects].[none:Start Date:qk]</cols>
  </table>
</worksheet>
```

---

## Treemap

`mark class='Square'` with `<size>` (hierarchy / magnitude) and `<color>`; `<lod>` and `<text>` for labels. Often empty top-level rows/cols when structure comes from encodings.

```xml
<worksheet name='Category Treemap'>
  <table>
    <view>
      <datasource-dependencies datasource='Sample - Superstore'>
        <column-instance column='[Category]' derivation='None' name='[none:Category:nk]' pivot='key' type='nominal' />
        <column-instance column='[Sub-Category]' derivation='None' name='[none:Sub-Category:nk]' pivot='key' type='nominal' />
        <column-instance column='[Sales]' derivation='Sum' name='[sum:Sales:qk]' pivot='key' type='quantitative' />
      </datasource-dependencies>
    </view>
    <style>
      <style-rule element='mark'>
        <mark class='Square' />
      </style-rule>
    </style>
    <panes>
      <pane>
        <mark class='Square' />
        <encodings>
          <color column='[Sample - Superstore].[none:Category:nk]' />
          <size column='[Sample - Superstore].[sum:Sales:qk]' />
          <lod column='[Sample - Superstore].[none:Sub-Category:nk]' />
          <text column='[Sample - Superstore].[none:Sub-Category:nk]' />
        </encodings>
      </pane>
    </panes>
    <rows></rows>
    <cols></cols>
  </table>
</worksheet>
```

---

## Dual Axis Chart

**Rows shelf:** two measures combined with **`+`**. Parentheses are **required** for certain patterns (see below). **Synchronize** secondary axis with `<encoding attr='space' ... synchronized='true' />` on the axis style; use **`y-axis-name`** (and optional **`y-index`**) on panes so each pane binds to the correct measure.

| Pattern | Rows syntax | Panes | Use case |
|---------|-------------|-------|----------|
| **Blended (A + A)** — same measure twice | `([ds].[m] + [ds].[m])` | 3 | Sparkline: line over area |
| **True dual (A + B)** — two measures | `[ds].[a] + [ds].[b]` | 2 | Two metrics, two scales |
| **Multiple Values + total** | `([ds].[Multiple Values] + [ds].[usr:total:qk])` | 3 | Stacked components + total line — see [programmatic-twb-learnings.md §15.6](programmatic-twb-learnings.md) |

**Critical:** Spaces instead of `(A + B)` can yield **"Malformed expression: unable to associate operators with operands"**. `[Multiple Values]` cannot sit alone on `<rows>` or `<cols>` — only inside `(A + B)` dual-axis patterns or in `<text>` encodings ([error-codes-and-pitfalls.md](error-codes-and-pitfalls.md)).

**Minimal dual-axis `<table>`** (Bar + Line, shared date column; add mark styles and dependencies as needed):

```xml
<table>
  <view>
    <datasource-dependencies datasource='Sample - Superstore'>
      <column-instance column='[Order Date]' derivation='Month-Trunc' name='[tmn:Order Date:qk]' pivot='key' type='quantitative' />
      <column-instance column='[Sales]' derivation='Sum' name='[sum:Sales:qk]' pivot='key' type='quantitative' />
      <column-instance column='[Profit]' derivation='Sum' name='[sum:Profit:qk]' pivot='key' type='quantitative' />
    </datasource-dependencies>
  </view>
  <style>
    <style-rule element='axis'>
      <encoding attr='space' class='1' field='[Sample - Superstore].[sum:Profit:qk]'
                field-type='quantitative' fold='true' scope='rows' synchronized='true' type='space' />
      <format attr='sync-pane-id' value='0' />
    </style-rule>
  </style>
  <panes>
    <pane id='0' selection-relaxation-option='selection-relaxation-allow'>
      <mark class='Bar' />
    </pane>
    <pane id='1' selection-relaxation-option='selection-relaxation-allow' y-axis-name='[Sample - Superstore].[sum:Profit:qk]' y-index='1'>
      <mark class='Line' />
    </pane>
  </panes>
  <rows>[Sample - Superstore].[sum:Sales:qk] + [Sample - Superstore].[sum:Profit:qk]</rows>
  <cols>[Sample - Superstore].[tmn:Order Date:qk]</cols>
</table>
```

Full sparkline / synchronized-axis XML templates: [programmatic-twb-learnings.md §24.3–24.4](programmatic-twb-learnings.md) and the skill’s sparkline template.

---

## Reference Lines

Inside the pane (or worksheet scope per workbook), `<reference-line>` references axis columns and formula.

```xml
<reference-line axis-column='[Sample - Superstore].[sum:Sales:qk]'
                enable-instant-analytics='true' formula='average'
                id='refline0' scope='per-pane' value-column='[Sample - Superstore].[sum:Sales:qk]'>
  <label>Avg Sales</label>
  <formatting-group>
    <format-band enabled='true' value-column='[Sample - Superstore].[sum:Sales:qk]' />
  </formatting-group>
</reference-line>
```

---

## Trend Lines

```xml
<trend-line enable-confidence-bands='true' enable-instant-analytics='true'
            exclude-color='false' exclude-intercept='false'
            trend-analysis-row-col-spec='Sample - Superstore'
            type='linear'>
  <x-column>[Sample - Superstore].[tmn:Order Date:qk]</x-column>
  <y-column>[Sample - Superstore].[sum:Sales:qk]</y-column>
</trend-line>
```

---

## Common Encodings

| Element | Role |
|---------|------|
| `<color>` | Color by dimension or measure |
| `<size>` | Mark size (scatter, Gantt duration, treemap) |
| `<shape>` | Shape palette |
| `<text>` | Labels / cell text |
| `<tooltip>` | Extra fields in default tooltip |
| `<detail>` | Level of detail (also `<lod>` in some workbooks) |
| `<wedge-size>` | Pie angle / size |

**Column-instance naming (production KPI Tracking):**

| Pattern | Meaning |
|---------|---------|
| `[none:Col:nk]` | Dimension, nominal |
| `[none:Col:ok]` | Dimension, ordinal |
| `[usr:Col:qk]` | User calc / aggregation, quantitative |
| `[sum:Col:qk]` | Sum of measure |
| `[yr:Col:ok]` | Year of date, ordinal |

---

## Customized Tooltips

`<formatted-text>` with multiple `<run>` elements; field values in CDATA.

```xml
<customized-tooltip>
  <formatted-text>
    <run fontcolor='#757575'>Label:&#9;</run>
    <run bold='true'><![CDATA[<[datasource].[column-instance]>]]></run>
    <run>Æ&#10;</run>
  </formatted-text>
</customized-tooltip>
```

**KPI Tracking conventions:** `fontcolor` for muted labels, `bold='true'` for values, `&#9;` tab, `Æ&#10;` line break, CDATA for `<[ds].[field]>` references.

---

## Customized Labels

Same `<formatted-text>` / `<run>` structure. **Put each field reference in its own `<run>`** — do not combine two field placeholders in a single `<run>` (Tableau may not resolve them correctly).

```xml
<customized-label>
  <formatted-text>
    <run bold='true' fontalignment='0' fontsize='15'>Title</run>
    <run fontalignment='0'>Æ&#10;</run>
    <run bold='true' fontname='Tableau Book' fontsize='15'>
      <![CDATA[<[datasource].[column-instance]>]]>
    </run>
  </formatted-text>
</customized-label>
```

---

## Style Rules

Production patterns (KPI Tracking):

```xml
<style>
  <style-rule element='mark'>
    <format attr='mark-labels-show' value='true' />
    <format attr='mark-labels-cull' value='true' />
    <format attr='mark-labels-mode' value='line-ends' />
    <format attr='mark-color' value='#b4b4b4' />
  </style-rule>
  <style-rule element='axis'>
    <format attr='title' field='[sum:Sales:qk]' value='Custom Title' />
  </style-rule>
  <style-rule element='worksheet'>
    <format attr='display-field-labels' scope='cols' value='false' />
  </style-rule>
</style>
```

Use only **`format`** attributes and **`element`** names that Tableau accepts for your workbook version. Invalid `element` or `attr` values cause load errors — see **[error-codes-and-pitfalls.md](error-codes-and-pitfalls.md)**.

**Number formats** (on `<column>` where applicable):

```xml
default-format='$#,##0'
default-format='#,##0'
default-format='0.00%'
default-format='p0%'
```

**Axis / header formatting:** `<style-rule element='axis'>` and `<style-rule element='header'>` with `format` children (titles, display, stroke, font).

---

## Sorting

**Sort by field** (on `<column-instance>`):

```xml
<column-instance column='[Category]' derivation='None' name='[none:Category:nk]'
                pivot='key' type='nominal'>
  <sort class='manual' direction='DESC' using='[sum:Sales:qk]' />
</column-instance>
```

**Manual dictionary sort:**

```xml
<column-instance column='[Category]' derivation='None' name='[none:Category:nk]' pivot='key' type='nominal'>
  <sort class='manual'>
    <dictionary>
      <bucket>"Furniture"</bucket>
      <bucket>"Office Supplies"</bucket>
      <bucket>"Technology"</bucket>
    </dictionary>
  </sort>
</column-instance>
```

**Generated TWBs:** `<manual-sort>` is **not** reliably valid on initial load of programmatic TWBs (D2E8DA72 — element not in schema). Prefer sort on `column-instance`, filter member order, or Desktop save. See [programmatic-twb-learnings.md §15.6](programmatic-twb-learnings.md) and [error-codes-and-pitfalls.md](error-codes-and-pitfalls.md).

---

## Aggregation

Include inside `<view>` when the viz aggregates:

```xml
<aggregation value='true' />
```

---

## Production checklist (KPI Tracking)

1. Define **column-instances** for every field on shelves or encodings.  
2. Use correct **derivation** prefixes (`none`, `usr`, `sum`, `yr`, …).  
3. Include **`<aggregation value='true' />`** when needed.  
4. Use **fully qualified** `[datasource].[column-instance]` references.  
5. Prefer **customized-tooltip** / **customized-label** for UX.  
6. For multi-pane charts, set **pane `id`**, **`y-axis-name`**, **`selection-relaxation-option`** as required.

Deeper pitfalls (Measure Names, sparklines, invalid attrs): **[programmatic-twb-learnings.md](programmatic-twb-learnings.md)**.
