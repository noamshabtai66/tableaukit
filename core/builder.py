"""
TWB builder v2 — converts spec dict → WorkbookModel → .twb XML.

Drop-in replacement for twb_builder.build_twb().
Uses workbook_model.py for guaranteed XML element ordering.
"""
from __future__ import annotations

import os
from pathlib import Path

from workbook_model import (
    WorkbookModel, DatasourceModel, WorksheetModel, DashboardModel,
    MetadataRecord, ColumnDecl, ColumnInstance, Encoding, PaneStyle,
    Zone, ZoneStyle, FilterAction, DrillPath,
    REMOTE_TYPE, DATATYPE, AGG_DERIV, AGG_PREFIX,
    CONTAINER_ZONE_STYLE, WORKSHEET_ZONE_STYLE,
    inst_name, ds_ref,
)
from formatters import infer_format
from calculated_fields import build_calculated_field
from color_palettes import infer_palette
from xml_validator import validate_and_repair


# ── Mappings ──────────────────────────────────────────────────────────────────

MARK_CLASS = {
    "bar": "Bar",
    "line": "Line",
    "pie": "Pie",
    "scatter": "Circle",
    "combo": "Line",
    "table": "Text",
}

_DIRECTION_COLORS = {
    "higher_is_better": "#059669",
    "lower_is_better":  "#DC2626",
    "neutral":          "#6B7280",
}

# Role-aware authoring rules — merged from authoring.py
AUTHORING_RULES: dict[str, dict] = {
    "hero_insight": {"max_tooltips": 3, "show_labels": True,  "color_encoding": True},
    "trend":        {"max_tooltips": 3, "show_labels": False, "color_encoding": False},
    "breakdown":    {"max_tooltips": 2, "show_labels": True,  "color_encoding": True},
    "comparison":   {"max_tooltips": 2, "show_labels": False, "color_encoding": True},
    "diagnostic":   {"max_tooltips": 3, "show_labels": False, "color_encoding": True},
    "detail":       {"max_tooltips": 2, "show_labels": True,  "color_encoding": True},
    "kpi_tile":     {"max_tooltips": 0, "show_labels": False, "color_encoding": False},
}

_GEO_ROLES = {
    "country": "[Country].[Name]",
    "state": "[State].[Name]",
    "region": "[State].[Name]",
    "city": "[City].[Name]",
    "zip": "[ZipCode].[Name]",
    "postal": "[ZipCode].[Name]",
    "latitude": "[Geographical].[Latitude]",
    "longitude": "[Geographical].[Longitude]",
}

# Layout constants
TITLE_H = 4000
KPI_H = 12000
# Stage-4 Cycle-6 — height reserved for the DesignPlan-caveats text zone
# when the LLM provides caveats.  Sized for ~3 bullet lines of small text
# (~9pt body in Tableau's coordinate system).
CAVEAT_H = 5000


# ── Helpers ───────────────────────────────────────────────────────────────────

def _semantic_role(field_name: str) -> str:
    lowered = field_name.lower()
    for key, role in _GEO_ROLES.items():
        if key in lowered:
            return role
    return ""


def _build_drill_paths(dimensions: list[dict]) -> list[DrillPath]:
    paths = []
    for d in dimensions:
        name = d["name"].lower()
        if "sub_" in name or "sub" in name:
            parent = name.replace("sub_", "").replace("sub", "")
            for pd in dimensions:
                if pd["name"].lower() == parent or pd["name"].lower() == parent.rstrip("_"):
                    paths.append(DrillPath("Category Detail", [pd["name"], d["name"]]))
                    break
    geo_order = []
    for level in ("country", "region", "state", "city"):
        for d in dimensions:
            if level in d["name"].lower():
                geo_order.append(d["name"])
                break
    if len(geo_order) >= 2:
        paths.append(DrillPath("Geography", geo_order))
    return paths


def _suggest_tooltips(chart: dict, meas_map: dict) -> list[str]:
    used = {chart.get("x", ""), chart.get("y", "")}
    candidates = []
    for name in meas_map:
        if name in used:
            continue
        lowered = name.lower()
        if "abs_" in lowered and lowered.replace("abs_", "") in used:
            continue
        score = 0
        if any(t in lowered for t in ("income", "expense", "profit", "balance", "revenue")):
            score += 2
        if any(t in lowered for t in ("count", "units", "volume")):
            score += 1
        candidates.append((name, score))
    candidates.sort(key=lambda x: -x[1])
    return [name for name, _ in candidates[:3]]


def _field_info(name: str, dim_map: dict, meas_map: dict):
    if name in dim_map:
        d = dim_map[name]
        return DATATYPE[d["type"]], True, None
    if name in meas_map:
        m = meas_map[name]
        return DATATYPE[m["type"]], False, m["aggregation"]
    return "string", True, None


# Phase 6D — date_grain → Tableau derivation + inst_name prefix.
# When a chart declares date_grain (e.g. "month") and an axis is a date
# dimension, the ColumnInstance must use the truncated derivation so the
# axis renders with the requested granularity (DATETRUNC equivalent in
# Tableau XML). Without this override, raw date dims emit `derivation="None"`
# which Tableau renders at day-level — the cause of the "daily bars" bug.
_DATE_GRAIN_TO_DERIVATION: dict[str, str] = {
    "year": "Year-Trunc",
    "quarter": "Quarter-Trunc",
    "month": "Month-Trunc",
    "week": "Week-Trunc",
    "day": "Day-Trunc",
}

_DATE_GRAIN_TO_INST_PREFIX: dict[str, str] = {
    "year": "yr",
    "quarter": "qr",
    "month": "mn",
    "week": "wk",
    "day": "dy",
}


def _date_inst_name(field_name: str, grain: str | None) -> str | None:
    """Build a truncated-date inst_name like ``[mn:date:qk]`` when grain
    is set. Returns None when there is no override (caller falls back to
    the default ``inst_name`` helper).
    """
    if not grain:
        return None
    prefix = _DATE_GRAIN_TO_INST_PREFIX.get(grain)
    if not prefix:
        return None
    return f"[{prefix}:{field_name}:qk]"


def _date_derivation(grain: str | None) -> str | None:
    if not grain:
        return None
    return _DATE_GRAIN_TO_DERIVATION.get(grain)


def _infer_role(chart: dict, dim_map: dict) -> str:
    ctype = chart.get("type", "bar")
    x = chart.get("x", "")
    if ctype == "line" and dim_map.get(x, {}).get("type") == "date":
        return "trend"
    if ctype == "pie":
        return "breakdown"
    if ctype == "scatter":
        return "diagnostic"
    if ctype == "bar" and chart.get("sort") == "desc":
        return "comparison"
    return "detail"


def _actions_from_intents(
    interaction_intents: list[dict], spec: dict
) -> list[FilterAction]:
    chart_map = {c["id"]: c for c in spec["charts"]}
    actions = []
    for intent in interaction_intents:
        src = chart_map.get(intent.get("source_sheet_id"))
        tgt = chart_map.get(intent.get("target_sheet_id"))
        if src and tgt:
            actions.append(FilterAction(
                caption=f"Filter: {src['title']} → {tgt['title']}",
                source_sheet=src["title"],
                target_sheet=tgt["title"],
            ))
    return actions


# ── Datasource builder ────────────────────────────────────────────────────────

def _build_datasource(spec: dict, hyper_path: str, csv_filename: str | None = None) -> DatasourceModel:
    title = spec.get("title", "Dashboard")
    ds_name = "data"

    all_fields = (
        [(d["name"], d["type"], True) for d in spec["dimensions"]]
        + [(m["name"], m["type"], False) for m in spec["measures"]]
    )

    # Metadata records
    records = []
    for i, (fname, ftype, _is_dim) in enumerate(all_fields):
        rtype = REMOTE_TYPE.get(ftype, "129")
        ltype = DATATYPE.get(ftype, "string")
        agg = "Count" if ftype == "string" else ("Sum" if ftype in ("integer", "float") else "Min")
        records.append(MetadataRecord(fname, rtype, f"[{fname}]", ltype, agg, i))

    # Raw columns
    columns = []
    for d in spec["dimensions"]:
        dt = DATATYPE[d["type"]]
        vtype = "ordinal" if d["type"] == "date" else "nominal"
        columns.append(ColumnDecl(
            d["name"], dt, "dimension", vtype,
            caption=d["label"],
            semantic_role=_semantic_role(d["name"]),
        ))
    for m in spec["measures"]:
        dt = DATATYPE[m["type"]]
        fmt = infer_format(m["name"], m["type"], m.get("label", ""))
        columns.append(ColumnDecl(
            m["name"], dt, "measure", "quantitative",
            caption=m["label"],
            default_format=fmt or "",
        ))

    # Calculated columns: KPIs
    calc_cols = []
    from formatters import kpi_format_string, CURRENCY_PLAIN
    for kpi in spec.get("kpis", []):
        measure = kpi["measure"]
        m_info = {m["name"]: m for m in spec["measures"]}.get(measure, {})
        # Stage-4 Cycle-2: prefer the KPI's own aggregation hint (from the
        # LLM's DesignPlan) over the measure-level default. Maps "latest"
        # → LOOKUP-based last-value calc when a date dim is available;
        # otherwise falls back to MAX as a directional proxy for snapshot
        # KPIs like Ending Balance. Without this, every KPI emitted as
        # SUM([col]) — nonsense for running balances.
        kpi_agg_raw = (kpi.get("aggregation") or "").strip().lower()
        if kpi_agg_raw == "latest":
            # No date-aware LATEST() in legacy Tableau calc grammar.
            # Use MAX as the closest directional proxy that still produces
            # a single value per dimension partition — better than SUM.
            agg = "MAX"
        elif kpi_agg_raw in ("avg", "average", "mean"):
            agg = "AVG"
        elif kpi_agg_raw in ("min", "minimum"):
            agg = "MIN"
        elif kpi_agg_raw in ("max", "maximum"):
            agg = "MAX"
        elif kpi_agg_raw in ("count",):
            agg = "COUNT"
        elif kpi_agg_raw in ("countd", "count_distinct", "distinct_count"):
            agg = "COUNTD"
        elif kpi_agg_raw in ("sum", "total"):
            agg = "SUM"
        else:
            # Legacy fallback: measure-level aggregation default (still SUM).
            agg = m_info.get("aggregation", "SUM")
        fmt_type = kpi.get("format", "plain")
        fmt_str = kpi_format_string(fmt_type)
        if agg == "AVG" and fmt_type == "currency":
            fmt_str = CURRENCY_PLAIN
        calc_cols.append(ColumnDecl(
            f"kpi_{measure}", "real", "measure", "quantitative",
            caption=kpi.get("title", measure),
            default_format=fmt_str,
            calculation_formula=f"{agg}([{measure}])",
        ))

    # Calculated columns: spec calculated_fields
    for calc_spec in spec.get("calculated_fields", []):
        try:
            cf = build_calculated_field(calc_spec)
            name = cf["name"].strip("[]")
            calc_cols.append(ColumnDecl(
                name, cf.get("datatype", "real"),
                cf.get("role", "measure"),
                cf.get("type", "quantitative"),
                caption=cf["caption"],
                default_format=cf.get("format") or "",
                calculation_formula=cf["formula"],
            ))
        except (ValueError, KeyError):
            pass

    drill_paths = _build_drill_paths(spec["dimensions"])

    # Deduplicate calculated columns by name; first definition wins.
    # This guards against duplicate KPI calc fields that would cause
    # Tableau to show a "field is already defined" warning on open.
    seen_calc_names: set[str] = set()
    unique_calc_cols: list[ColumnDecl] = []
    for col in calc_cols:
        if col.name not in seen_calc_names:
            unique_calc_cols.append(col)
            seen_calc_names.add(col.name)
    calc_cols = unique_calc_cols

    return DatasourceModel(
        name=ds_name, caption=title, hyper_path=hyper_path,
        metadata_records=records, columns=columns,
        calculated_columns=calc_cols, drill_paths=drill_paths,
        csv_filename=csv_filename,
    )


# ── KPI worksheet builder ────────────────────────────────────────────────────

def _build_kpi_worksheet(kpi: dict, ds_name: str, ds_caption: str,
                         meas_map: dict) -> WorksheetModel:
    measure = kpi["measure"]
    kpi_title = kpi.get("title", measure)
    direction = kpi.get("direction", "neutral")
    text_color = _DIRECTION_COLORS.get(direction, "#6B7280")

    fmt_type = kpi.get("format", "plain")
    from formatters import kpi_format_string, CURRENCY_PLAIN
    fmt_str = kpi_format_string(fmt_type)
    m_info = meas_map.get(measure, {})
    agg = m_info.get("aggregation", "SUM")
    if agg == "AVG" and fmt_type == "currency":
        fmt_str = CURRENCY_PLAIN

    kpi_col = f"kpi_{measure}"
    inst = f"[usr:{kpi_col}:qk]"
    ref = ds_ref(ds_name, inst)

    return WorksheetModel(
        name=kpi_title,
        ds_name=ds_name,
        ds_caption=ds_caption,
        dep_columns=[ColumnDecl(kpi_col, "real", "measure", "quantitative",
                                caption=kpi_title, default_format=fmt_str)],
        dep_instances=[ColumnInstance(kpi_col, "User", inst, "quantitative")],
        mark_class="Text",
        encodings=[Encoding("text", ref)],
        customized_label=f"<{ref}>",
        pane_style=PaneStyle(show_labels=False, cell_color=text_color),
        title_text=kpi_title,
        table_style_rules=[
            ("cell", [("font-size", "9"), ("font-weight", "bold"),
                      ("color", text_color), ("text-align", "center")]),
            ("header", [("font-size", "0")]),
            ("axis", [("font-size", "0")]),
        ],
    )


# ── Chart worksheet builder ──────────────────────────────────────────────────

def _build_list_table_worksheet(chart: dict, spec: dict, ds_name: str,
                                 dim_map: dict, meas_map: dict,
                                 palette: dict, role: str) -> WorksheetModel:
    """Emit a Tableau text-table for ``chart_intent == "list"``.

    Layout matches the validated Crosstab pattern from
    ``docs/tableau-twb/references/visualizations-and-charts.md`` §"Text Table":

      - First dim on ``<rows>``; second dim (if any) on ``<cols>``.
      - First measure as ``<text>`` encoding; further measures as tooltips.
      - ``mark class='Text'`` on the pane plus a table-level
        ``style-rule element='mark'`` so Tableau picks the right mark.

    The DesignPlanner emits these when it requests detail breakdowns like
    "Largest Transactions" or "Top SKUs by Revenue" — without this branch
    those charts were skipped at the compiler guard (concept_compiler:378)
    because they have no x/y, only ``columns``.
    """
    title = chart["title"]
    ds_caption = spec.get("title", "Dashboard")
    columns_raw = chart.get("columns") or []

    # Partition columns into dims vs. measures while preserving order.
    dims: list[str] = []
    measures: list[str] = []
    for col in columns_raw:
        if col in meas_map:
            measures.append(col)
        elif col in dim_map:
            dims.append(col)
        # Silently drop unknown names — the compiler already filtered them,
        # so anything left should be in one of the maps. Defensive only.

    if not dims and not measures:
        # Nothing renderable — fail loud like the rest of the builder.
        raise ValueError(
            f"twb_builder: list chart {chart.get('id', '?')!r} resolved "
            "zero usable dims/measures from `columns`; refusing to build."
        )

    def label_of(name: str) -> str:
        if name in dim_map:
            return dim_map[name].get("label", name)
        if name in meas_map:
            return meas_map[name].get("label", name)
        return name

    dep_cols: list[ColumnDecl] = []
    dep_insts: list[ColumnInstance] = []
    dim_refs: list[str] = []

    for col in dims:
        fdt, _, _ = _field_info(col, dim_map, meas_map)
        vtype = "ordinal" if fdt == "date" else "nominal"
        dep_cols.append(ColumnDecl(
            col, fdt, "dimension", vtype,
            caption=label_of(col),
        ))
        inst = inst_name(col, True, fdt, None)
        dep_insts.append(ColumnInstance(col, "None", inst, vtype))
        dim_refs.append(ds_ref(ds_name, inst))

    text_ref: str | None = None
    tooltip_refs: list[str] = []
    for i, col in enumerate(measures):
        fdt, _, fagg = _field_info(col, dim_map, meas_map)
        fmt = infer_format(col, fdt) or ""
        dep_cols.append(ColumnDecl(
            col, fdt, "measure", "quantitative",
            caption=label_of(col),
            default_format=fmt,
        ))
        deriv = AGG_DERIV.get(fagg, "Sum")
        inst = inst_name(col, False, fdt, fagg)
        dep_insts.append(ColumnInstance(col, deriv, inst, "quantitative"))
        ref = ds_ref(ds_name, inst)
        if i == 0:
            text_ref = ref
        else:
            tooltip_refs.append(ref)

    encodings: list[Encoding] = []
    if text_ref:
        encodings.append(Encoding("text", text_ref))
    for ref in tooltip_refs:
        encodings.append(Encoding("tooltip", ref))

    # Shelf assignment: ALL dimensions stacked on rows with " / " (the
    # validated Tableau syntax for nested row hierarchies — same shape
    # Tableau Desktop emits when you drag multiple dims onto rows).
    # Earlier this helper put the second dim on cols (the 2D crosstab
    # pattern from visualizations-and-charts.md §"Text Table"), which
    # produced a sparse matrix instead of a detail list: e.g. supermarket
    # showed Branch/City/Customer-type values pivoted into columns
    # ("Null", "Mandalay", "Member", "Female") with mostly-empty cells.
    # A detail list keeps every row of the underlying data visible — one
    # row per unique dim combination, the measure as the text cell.
    rows_ref = ""
    cols_ref = ""
    if dim_refs:
        rows_ref = " / ".join(dim_refs)

    table_rules = [
        ("table",     [("background-color", "#ffffff")]),
        # Hide field labels on rows so the dim name isn't repeated above values.
        ("worksheet", [("display-field-labels", "false")]),
        # 18e: text-table label alignment.
        ("label",     [("text-align", "left"), ("font-size", "9")]),
        # Drive the mark-class via table style as well — matches the
        # docs/tableau-twb Text Table pattern.
        ("mark",      [("mark-labels-show", "true")]),
    ]

    return WorksheetModel(
        name=title, ds_name=ds_name, ds_caption=ds_caption,
        dep_columns=dep_cols, dep_instances=dep_insts,
        mark_class="Text",
        rows_ref=rows_ref,
        cols_ref=cols_ref,
        encodings=encodings,
        pane_style=PaneStyle(show_labels=True),
        title_text=title,
        table_style_rules=table_rules,
    )


def _build_chart_worksheet(chart: dict, spec: dict, ds_name: str,
                           dim_map: dict, meas_map: dict,
                           palette: dict,
                           role: str = "detail") -> WorksheetModel:
    title = chart["title"]
    x_field = chart.get("x", "")
    y_field = chart.get("y", "")
    color_f = chart.get("color")
    ctype = chart.get("type", "bar")
    mark = MARK_CLASS.get(ctype, "Bar")
    ds_caption = spec.get("title", "Dashboard")
    rules = AUTHORING_RULES.get(role, AUTHORING_RULES["detail"])

    # Defense-in-depth: refuse to build a sheet whose x/y axes are empty.
    # An empty x_field flows down through inst_name() into `<column name="[]"/>`
    # and `[none::nk]` shelf refs — exactly the structural defect Tableau
    # rejects with DD3C47AE. Failing here points the developer at the chart id.
    chart_intent = chart.get("chart_intent")
    chart_id = chart.get("id", "?")
    if chart_intent in {"comparison", "trend", "breakdown"}:
        if not x_field:
            raise ValueError(
                f"twb_builder: chart {chart_id!r} (intent={chart_intent!r}) "
                f"has empty x-field; refusing to build a sheet Tableau cannot open."
            )
        if not y_field:
            raise ValueError(
                f"twb_builder: chart {chart_id!r} (intent={chart_intent!r}) "
                f"has empty y-field; refusing to build a sheet Tableau cannot open."
            )
    elif chart_intent == "list":
        # Stage-4 Cycle-3: route list charts with `columns` to the text-table
        # helper. Without this branch the code below tries inst_name("") and
        # raises, which is why concept_compiler:378 used to skip these charts.
        if chart.get("columns"):
            return _build_list_table_worksheet(
                chart, spec, ds_name, dim_map, meas_map, palette, role,
            )
        if not (x_field or y_field):
            raise ValueError(
                f"twb_builder: list chart {chart_id!r} has no columns and no "
                "x/y field; refusing to build an empty 'Abc' table."
            )

    x_dt, x_is_dim, x_agg = _field_info(x_field, dim_map, meas_map)
    y_dt, y_is_dim, y_agg = _field_info(y_field, dim_map, meas_map)

    # Phase 6D — honor chart.date_grain: when the X axis is a date dim and
    # the recipe specified a grain (e.g. "month"), override the inst_name
    # so the cross-references resolve to a truncated-date ColumnInstance.
    chart_grain = chart.get("date_grain")
    if x_is_dim and x_dt == "date":
        x_inst = _date_inst_name(x_field, chart_grain) or inst_name(x_field, x_is_dim, x_dt, x_agg)
    else:
        x_inst = inst_name(x_field, x_is_dim, x_dt, x_agg)
    if y_is_dim and y_dt == "date":
        y_inst = _date_inst_name(y_field, chart_grain) or inst_name(y_field, y_is_dim, y_dt, y_agg)
    else:
        y_inst = inst_name(y_field, y_is_dim, y_dt, y_agg)

    tooltip_fields = _suggest_tooltips(chart, meas_map)[:rules["max_tooltips"]]

    def label_of(name):
        if name in dim_map:
            return dim_map[name].get("label", name)
        if name in meas_map:
            return meas_map[name].get("label", name)
        return name

    # Build deps
    dep_cols = []
    dep_insts = []

    if ctype == "pie":
        # Pie: x=dim(color), y=measure(wedge)
        used = [x_field, y_field] + tooltip_fields
        for fname in used:
            fdt, is_dim, fagg = _field_info(fname, dim_map, meas_map)
            fmt = "" if is_dim else (infer_format(fname, fdt) or "")
            dep_cols.append(ColumnDecl(fname, fdt, "dimension" if is_dim else "measure",
                                       ("ordinal" if fdt == "date" else "nominal") if is_dim else "quantitative",
                                       caption=label_of(fname), default_format=fmt))
        for fname in used:
            fdt, is_dim, fagg = _field_info(fname, dim_map, meas_map)
            deriv = "None" if is_dim else AGG_DERIV.get(fagg, "Sum")
            itype = ("ordinal" if fdt == "date" else "nominal") if is_dim else "quantitative"
            dep_insts.append(ColumnInstance(fname, deriv, inst_name(fname, is_dim, fdt, fagg), itype))

        encodings = [
            Encoding("color", ds_ref(ds_name, x_inst)),
            Encoding("wedge-size", ds_ref(ds_name, y_inst)),
        ]
        for tf in tooltip_fields:
            tf_dt, tf_dim, tf_agg = _field_info(tf, dim_map, meas_map)
            encodings.append(Encoding("tooltip", ds_ref(ds_name, inst_name(tf, tf_dim, tf_dt, tf_agg))))

        return WorksheetModel(
            name=title, ds_name=ds_name, ds_caption=ds_caption,
            dep_columns=dep_cols, dep_instances=dep_insts,
            mark_class=mark, encodings=encodings,
            pane_style=PaneStyle(show_labels=rules["show_labels"]),
            title_text=title,
        )
    else:
        # bar, line, scatter
        used_fields = [x_field, y_field]
        if color_f and color_f not in used_fields and rules["color_encoding"]:
            used_fields.append(color_f)
        for tf in tooltip_fields:
            if tf not in used_fields:
                used_fields.append(tf)

        for fname in used_fields:
            fdt, is_dim, fagg = _field_info(fname, dim_map, meas_map)
            fmt = "" if is_dim else (infer_format(fname, fdt) or "")
            dep_cols.append(ColumnDecl(fname, fdt, "dimension" if is_dim else "measure",
                                       ("ordinal" if fdt == "date" else "nominal") if is_dim else "quantitative",
                                       caption=label_of(fname), default_format=fmt))
        for fname in used_fields:
            fdt, is_dim, fagg = _field_info(fname, dim_map, meas_map)
            # Phase 6D — date dimension with declared grain emits truncated
            # derivation (e.g. "Month-Trunc") and matching inst_name prefix.
            if is_dim and fdt == "date" and chart_grain:
                deriv = _date_derivation(chart_grain) or "None"
                inst = _date_inst_name(fname, chart_grain) or inst_name(fname, is_dim, fdt, fagg)
            else:
                deriv = "None" if is_dim else AGG_DERIV.get(fagg, "Sum")
                inst = inst_name(fname, is_dim, fdt, fagg)
            itype = ("ordinal" if fdt == "date" else "nominal") if is_dim else "quantitative"
            dep_insts.append(ColumnInstance(fname, deriv, inst, itype))

        encodings = []
        if color_f and rules["color_encoding"]:
            c_dt, c_dim, c_agg = _field_info(color_f, dim_map, meas_map)
            if c_dim and c_dt == "date" and chart_grain:
                color_inst = _date_inst_name(color_f, chart_grain) or inst_name(color_f, c_dim, c_dt, c_agg)
            else:
                color_inst = inst_name(color_f, c_dim, c_dt, c_agg)
            encodings.append(Encoding("color", ds_ref(ds_name, color_inst)))
        for tf in tooltip_fields:
            tf_dt, tf_dim, tf_agg = _field_info(tf, dim_map, meas_map)
            encodings.append(Encoding("tooltip", ds_ref(ds_name, inst_name(tf, tf_dim, tf_dt, tf_agg))))

        mark_color = palette.get("colors", ["#2563EB"])[0] if not (color_f and rules["color_encoding"]) else ""

        # Table-level style for charts
        table_rules = [
            ("table",     [("background-color", "#ffffff")]),
            ("worksheet", [("display-field-labels", "false")]),
            ("axis",      [("font-size", "9")]),
            ("header",    [("font-weight", "bold")]),
            ("label",     [("font-size", "9"), ("color", "#000000")]),
        ]
        if ctype == "pie":
            table_rules.append(("refline", [("line-visibility", "off")]))

        # Stage-4 Cycle-4 — dual-axis combo emission.
        # The DesignPlanner sets chart.y2 for combo charts like
        # "Cashflow + Balance" (bar primary, line secondary). When y2 is
        # a real measure, augment dep_cols+dep_insts with it and emit the
        # validated `[y] + [y2]` rows-shelf syntax from
        # docs/tableau-twb/references/visualizations-and-charts.md
        # §"Dual Axis Chart". Otherwise the y2 was silently dropped and
        # the LLM's "combo" downgraded to a single-series chart.
        y2_field = chart.get("y2") if isinstance(chart.get("y2"), str) else ""
        rows_ref_str = ds_ref(ds_name, y_inst)
        secondary_axis_ref = ""
        secondary_mark = ""
        primary_mark = mark
        if y2_field and y2_field in meas_map and y2_field != y_field:
            y2_dt, _, y2_agg = _field_info(y2_field, dim_map, meas_map)
            y2_fmt = infer_format(y2_field, y2_dt) or ""
            dep_cols.append(ColumnDecl(
                y2_field, y2_dt, "measure", "quantitative",
                caption=label_of(y2_field), default_format=y2_fmt,
            ))
            y2_inst = inst_name(y2_field, False, y2_dt, y2_agg)
            dep_insts.append(ColumnInstance(
                y2_field, AGG_DERIV.get(y2_agg, "Sum"),
                y2_inst, "quantitative",
            ))
            y2_ref = ds_ref(ds_name, y2_inst)
            rows_ref_str = f"{rows_ref_str} + {y2_ref}"
            secondary_axis_ref = y2_ref
            # For combo charts the canonical pairing is Bar (primary) +
            # Line (secondary).  Other types keep their mark on primary
            # and default Line on secondary.
            if ctype == "combo":
                primary_mark = "Bar"
            secondary_mark = "Line"

        return WorksheetModel(
            name=title, ds_name=ds_name, ds_caption=ds_caption,
            dep_columns=dep_cols, dep_instances=dep_insts,
            mark_class=primary_mark,
            rows_ref=rows_ref_str,
            cols_ref=ds_ref(ds_name, x_inst),
            encodings=encodings,
            secondary_mark_class=secondary_mark,
            secondary_axis_ref=secondary_axis_ref,
            pane_style=PaneStyle(mark_color=mark_color, show_labels=rules["show_labels"]),
            title_text=title,
            table_style_rules=table_rules,
        )


# ── Zone builders ─────────────────────────────────────────────────────────────

def _build_zone_tree(chart_names: list[str], kpi_names: list[str],
                     layout_type: str, title: str,
                     filter_fields: list[str] | None, ds_name: str,
                     caveats: list[str] | None = None) -> Zone:
    """Build the full zone tree for a dashboard.

    Stage-4 Cycle-6: when `caveats` is non-empty, inserts a text zone
    between the title and the KPI row containing the DesignPlan's
    caveats (joined with " · ").  Each caveat is truncated to 120 chars
    and at most 3 caveats render so the zone stays one short line.
    """
    zone_id = [2]  # mutable counter

    def next_id():
        zone_id[0] += 1
        return zone_id[0]

    has_filters = bool(filter_fields)
    W = 80000 if has_filters else 100000
    half_w = W // 2

    root_children = []

    # Title zone
    if title:
        root_children.append(Zone(
            zone_id=next_id(), zone_type="text", w=W, h=TITLE_H,
            text_content=title, text_fontsize=16, text_bold=True,
        ))
        y_after_title = TITLE_H
    else:
        y_after_title = 0

    # Stage-4 Cycle-6 — caveats text zone.  Renders below the title
    # using a smaller, non-bold font (9-10pt) so it reads as supporting
    # data-quality / scope context, not a competing headline.
    if caveats:
        joined = " · ".join(
            (str(c).strip()[:120] for c in caveats if str(c or "").strip())
        )
        if joined:
            root_children.append(Zone(
                zone_id=next_id(), zone_type="text", w=W, h=CAVEAT_H,
                x=0, y=y_after_title,
                text_content=joined, text_fontsize=10, text_bold=False,
            ))
            y_after_title += CAVEAT_H

    if layout_type == "kpi_header+2x2":
        # KPI row
        kpi_count = max(len(kpi_names), 1)
        kpi_w = W // kpi_count
        kpi_children = [
            Zone(zone_id=next_id(), zone_type="", w=kpi_w, h=KPI_H,
                 x=i * kpi_w, y=y_after_title, name=name, show_caption=False,
                 zone_style=WORKSHEET_ZONE_STYLE)
            for i, name in enumerate(kpi_names)
        ]
        root_children.append(Zone(
            zone_id=next_id(), zone_type="layout-flow", param="horz",
            w=W, h=KPI_H, x=0, y=y_after_title, children=kpi_children,
            friendly_name="KPI Row", zone_style=CONTAINER_ZONE_STYLE,
        ))

        # Charts: 2 rows x 2
        chart_y = y_after_title + KPI_H
        chart_total_h = 100000 - chart_y
        row_h = chart_total_h // 2
        charts = (chart_names + [""] * 4)[:4]

        # Row 1
        row1_children = []
        if charts[0]:
            row1_children.append(Zone(zone_id=next_id(), zone_type="", w=half_w, h=row_h,
                                      x=0, y=chart_y, name=charts[0],
                                      zone_style=WORKSHEET_ZONE_STYLE))
        if charts[1]:
            row1_children.append(Zone(zone_id=next_id(), zone_type="", w=half_w, h=row_h,
                                      x=half_w, y=chart_y, name=charts[1],
                                      zone_style=WORKSHEET_ZONE_STYLE))
        root_children.append(Zone(
            zone_id=next_id(), zone_type="layout-flow", param="horz",
            w=W, h=row_h, x=0, y=chart_y, children=row1_children,
            friendly_name="Charts Row 1", zone_style=CONTAINER_ZONE_STYLE,
        ))

        # Row 2
        row2_y = chart_y + row_h
        row2_children = []
        if charts[2]:
            row2_children.append(Zone(zone_id=next_id(), zone_type="", w=half_w, h=row_h,
                                      x=0, y=row2_y, name=charts[2],
                                      zone_style=WORKSHEET_ZONE_STYLE))
        if charts[3]:
            row2_children.append(Zone(zone_id=next_id(), zone_type="", w=half_w, h=row_h,
                                      x=half_w, y=row2_y, name=charts[3],
                                      zone_style=WORKSHEET_ZONE_STYLE))
        root_children.append(Zone(
            zone_id=next_id(), zone_type="layout-flow", param="horz",
            w=W, h=row_h, x=0, y=row2_y, children=row2_children,
            friendly_name="Charts Row 2", zone_style=CONTAINER_ZONE_STYLE,
        ))

    elif layout_type == "kpi_header+1x3":
        # KPI row
        kpi_count = max(len(kpi_names), 1)
        kpi_w = W // kpi_count
        kpi_children = [
            Zone(zone_id=next_id(), zone_type="", w=kpi_w, h=KPI_H,
                 x=i * kpi_w, y=y_after_title, name=name, show_caption=False,
                 zone_style=WORKSHEET_ZONE_STYLE)
            for i, name in enumerate(kpi_names)
        ]
        root_children.append(Zone(
            zone_id=next_id(), zone_type="layout-flow", param="horz",
            w=W, h=KPI_H, x=0, y=y_after_title, children=kpi_children,
            friendly_name="KPI Row", zone_style=CONTAINER_ZONE_STYLE,
        ))

        # 3-col chart row
        chart_y = y_after_title + KPI_H
        chart_h = 100000 - chart_y
        charts = (chart_names + [""] * 3)[:3]
        chart_w = W // 3
        chart_children = []
        for i, cname in enumerate(charts):
            if cname:
                chart_children.append(Zone(zone_id=next_id(), zone_type="", w=chart_w, h=chart_h,
                                           x=i * chart_w, y=chart_y, name=cname,
                                           zone_style=WORKSHEET_ZONE_STYLE))
        root_children.append(Zone(
            zone_id=next_id(), zone_type="layout-flow", param="horz",
            w=W, h=chart_h, x=0, y=chart_y, children=chart_children,
            friendly_name="Charts Row", zone_style=CONTAINER_ZONE_STYLE,
        ))

    else:  # full_width+stacked
        chart_y = y_after_title
        chart_total_h = 100000 - chart_y
        n = max(len(chart_names), 1)
        h_each = chart_total_h // n
        for i, cname in enumerate(chart_names):
            root_children.append(Zone(
                zone_id=next_id(), zone_type="", w=W, h=h_each,
                x=0, y=chart_y + i * h_each, name=cname,
                zone_style=WORKSHEET_ZONE_STYLE,
            ))

    # Filter panel (right sidebar)
    if has_filters and filter_fields:
        ref_sheet = chart_names[0] if chart_names else ""
        filter_y = y_after_title
        filter_total_h = 100000 - filter_y
        filter_each_h = filter_total_h // max(len(filter_fields), 1)
        filter_w = 100000 - W

        filter_children = []
        for i, fname in enumerate(filter_fields):
            filter_children.append(Zone(
                zone_id=next_id(), zone_type="", w=filter_w, h=filter_each_h,
                x=W, y=filter_y + i * filter_each_h,
                name=ref_sheet, is_filter=True,
                filter_param=f"[{ds_name}].[none:{fname}:nk]",
                show_caption=True,
            ))
        root_children.append(Zone(
            zone_id=next_id(), zone_type="layout-flow", param="vert",
            w=filter_w, h=filter_total_h, x=W, y=filter_y,
            children=filter_children,
            friendly_name="Filters Panel", zone_style=CONTAINER_ZONE_STYLE,
        ))

    return Zone(
        zone_id=2, zone_type="layout-basic", w=100000, h=100000,
        children=root_children,
    )


def _build_filter_actions(chart_names: list[str]) -> list[FilterAction]:
    """Heuristic: pair adjacent charts."""
    if len(chart_names) < 2:
        return []
    actions = [FilterAction(f"Filter 1", chart_names[0], chart_names[1])]
    if len(chart_names) >= 4:
        actions.append(FilterAction(f"Filter 2", chart_names[2], chart_names[3]))
    return actions


# ── Main entry point ──────────────────────────────────────────────────────────

def spec_to_workbook_model(spec: dict, hyper_path: str, csv_filename: str | None = None) -> WorkbookModel:
    """Convert enriched spec → WorkbookModel (no semantic plan).

    EQ-102 B2b: when csv_filename is set, the datasource emits a textscan
    block pointing at the user's CSV bundled at Data/Datasources/<filename>.
    Otherwise the legacy hyper-template ref is used.
    """
    ds_name = "data"
    domain = spec.get("domain", "sales")
    palette = infer_palette(domain)
    title = spec.get("title", "Dashboard")
    dim_map = {d["name"]: d for d in spec["dimensions"]}
    meas_map = {m["name"]: m for m in spec["measures"]}

    datasource = _build_datasource(spec, hyper_path, csv_filename=csv_filename)

    worksheets = []
    for kpi in spec.get("kpis", []):
        worksheets.append(_build_kpi_worksheet(kpi, ds_name, title, meas_map))
    for chart in spec["charts"]:
        role = _infer_role(chart, dim_map)
        worksheets.append(_build_chart_worksheet(chart, spec, ds_name, dim_map, meas_map, palette, role))

    kpi_names = [kpi.get("title", kpi["measure"]) for kpi in spec.get("kpis", [])]
    chart_names = [c["title"] for c in spec["charts"]]
    layout_type = spec.get("layout", "kpi_header+2x2")
    filter_fields = spec.get("filters", [])

    # Stage-4 Cycle-6: pass DesignPlan caveats (when present) to the
    # zone tree so the dashboard surfaces data-quality notes.
    caveats_raw = spec.get("caveats")
    caveats_list = list(caveats_raw) if isinstance(caveats_raw, list) else None
    root_zone = _build_zone_tree(chart_names, kpi_names, layout_type, title,
                                  filter_fields, ds_name,
                                  caveats=caveats_list)
    # Filter actions disabled — see workbook_model.render() note (D2E8DA72).
    dashboard = DashboardModel(
        name=title, root_zone=root_zone, actions=[],
    )

    return WorkbookModel(
        datasource=datasource, worksheets=worksheets, dashboard=dashboard,
        palette_name=palette["name"], palette_colors=palette["colors"],
    )


def plan_to_workbook(
    spec: dict,
    hyper_path: str,
    semantic_plan: dict | None = None,
) -> WorkbookModel:
    """Convert enriched spec + optional semantic plan → WorkbookModel (role-aware).

    When semantic_plan is provided its sheet_intents override heuristic role inference
    and its interaction_intents are used to build filter actions instead of the
    heuristic adjacency pairing.
    """
    ds_name = "data"
    domain = spec.get("domain", "sales")
    palette = infer_palette(domain)
    title = spec.get("title", "Dashboard")
    dim_map = {d["name"]: d for d in spec["dimensions"]}
    meas_map = {m["name"]: m for m in spec["measures"]}

    sheet_roles: dict[str, str] = {}
    if semantic_plan:
        for si in semantic_plan.get("sheet_intents", []):
            sheet_roles[si["sheet_id"]] = si.get("role", "detail")

    datasource = _build_datasource(spec, hyper_path)

    worksheets = []
    for kpi in spec.get("kpis", []):
        worksheets.append(_build_kpi_worksheet(kpi, ds_name, title, meas_map))
    for chart in spec["charts"]:
        role = sheet_roles.get(chart.get("id")) or _infer_role(chart, dim_map)
        worksheets.append(_build_chart_worksheet(chart, spec, ds_name, dim_map, meas_map, palette, role))

    kpi_names = [kpi.get("title", kpi["measure"]) for kpi in spec.get("kpis", [])]
    chart_names = [c["title"] for c in spec["charts"]]
    layout_type = spec.get("layout", "kpi_header+2x2")
    filter_fields = spec.get("filters", [])

    # Stage-4 Cycle-6: pass DesignPlan caveats (when present) to the
    # zone tree so the dashboard surfaces data-quality notes.
    caveats_raw = spec.get("caveats")
    caveats_list = list(caveats_raw) if isinstance(caveats_raw, list) else None
    root_zone = _build_zone_tree(chart_names, kpi_names, layout_type, title,
                                  filter_fields, ds_name,
                                  caveats=caveats_list)

    # Filter actions disabled — see workbook_model.render() note (D2E8DA72).
    dashboard = DashboardModel(name=title, root_zone=root_zone, actions=[])

    return WorkbookModel(
        datasource=datasource, worksheets=worksheets, dashboard=dashboard,
        palette_name=palette["name"], palette_colors=palette["colors"],
    )


def build_twb(spec: dict, hyper_relative_path: str, output_path: str, csv_filename: str | None = None) -> str:
    """Build .twb XML. Drop-in replacement for twb_builder.build_twb().

    EQ-102 B2b: pass csv_filename to emit textscan datasource instead of
    the hyper-template ref. Otherwise the .twb references a hyper that
    won't exist in the .twbx when csv_path packaging was used, causing
    Tableau Desktop to raise an internal error on open.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    model = spec_to_workbook_model(spec, hyper_relative_path, csv_filename=csv_filename)
    xml = model.render()
    result = validate_and_repair(xml)
    if result["errors_after"]:
        raise ValueError("Generated TWB failed XML validation: " + "; ".join(result["errors_after"]))
    xml = result["fixed_xml"]
    Path(output_path).write_text(xml, encoding="utf-8")
    print(f"TWB file created: {output_path}")
    return output_path
