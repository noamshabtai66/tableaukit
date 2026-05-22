"""
WorkbookModel — Python object graph that renders to Tableau .twb XML via lxml.

Element ordering is guaranteed by code, not programmer memory.
Content model derived from analysis of 25+ real Tableau Desktop workbooks.

Usage:
    model = WorkbookModel(datasource, worksheets, dashboard, palette_name, palette_colors)
    xml_str = model.render()
    Path("dashboard.twb").write_text(xml_str)
"""
from __future__ import annotations

import uuid as _uuid_mod
from dataclasses import dataclass, field
from lxml import etree


# ── Constants ─────────────────────────────────────────────────────────────────

REMOTE_TYPE = {"string": "129", "integer": "20", "float": "5", "date": "133"}
DATATYPE    = {"string": "string", "integer": "integer", "float": "real", "date": "date"}
AGG_DERIV   = {"SUM": "Sum", "AVG": "Avg", "COUNT": "Count", "MAX": "Max", "MIN": "Min"}
AGG_PREFIX  = {"SUM": "sum", "AVG": "avg", "COUNT": "cnt", "MAX": "max", "MIN": "min"}

MANIFEST_FLAGS = [
    "AnimationOnByDefault",
    "AutoCreateAndUpdateDSDPhoneLayouts",
    "DatabricksCatalog",
    "ISO8601DefaultCalendarPref",
    "IntuitiveSorting",
    "IntuitiveSorting_SP2",
    "MarkAnimation",
    "ObjectModelEncapsulateLegacy",
    "ObjectModelTableType",
    "SchemaViewerObjectModel",
    "SetMembershipControl",
    "SheetIdentifierTracking",
    "WindowsPersistSimpleIdentifiers",
    "ZoneFriendlyName",
    "_.fcp.DashboardRoundedCorners.true...DashboardRoundedCorners",
]


# ── Helper ────────────────────────────────────────────────────────────────────

def _new_uuid() -> str:
    return f"{{{_uuid_mod.uuid4()}}}"


def _sub(parent: etree._Element, tag: str, text: str | None = None,
         **attrs: str) -> etree._Element:
    """Shortcut: create SubElement, set text, return it."""
    el = etree.SubElement(parent, tag, **{k.rstrip("_"): v for k, v in attrs.items()})
    if text is not None:
        el.text = text
    return el


# ── Instance / column helpers ─────────────────────────────────────────────────

def inst_name(field_name: str, is_dim: bool, datatype: str, agg: str | None) -> str:
    """Compute Tableau instance name: [sum:revenue:qk] or [none:region:nk].

    Defense-in-depth: callers must pass a non-empty field_name. An empty name
    would produce `[none::nk]` or `[sum::qk]` — patterns Tableau Desktop
    refuses with DD3C47AE. Raising here surfaces the upstream bug at its
    closest reachable point.
    """
    if not field_name:
        raise ValueError(
            "inst_name received empty field_name; "
            f"is_dim={is_dim}, datatype={datatype!r}, agg={agg!r}"
        )
    if is_dim:
        suffix = "qk" if datatype == "date" else "nk"
        return f"[none:{field_name}:{suffix}]"
    prefix = AGG_PREFIX.get(agg, "sum")
    return f"[{prefix}:{field_name}:qk]"


def ds_ref(ds_name: str, inst: str) -> str:
    return f"[{ds_name}].{inst}"


# ── Zone styling ─────────────────────────────────────────────────────────────

@dataclass
class ZoneStyle:
    """Rendered as <zone-style> as the LAST child of a <zone>.
    corner_radius maps to the special _.fcp.DashboardRoundedCorners element."""
    border_color: str = ""
    border_style: str = ""
    border_width: str = ""
    corner_radius: str = ""
    margin: str = ""
    background_color: str = ""
    padding: str = ""

    def is_empty(self) -> bool:
        return not any([
            self.border_color, self.border_style, self.border_width,
            self.corner_radius, self.margin, self.background_color, self.padding,
        ])

    def to_xml(self) -> etree._Element:
        zs = etree.Element("zone-style")
        if self.border_color:
            _sub(zs, "format", attr="border-color", value=self.border_color)
        if self.border_style:
            _sub(zs, "format", attr="border-style", value=self.border_style)
        if self.border_width:
            _sub(zs, "format", attr="border-width", value=self.border_width)
        if self.corner_radius:
            rc = etree.SubElement(zs, "_.fcp.DashboardRoundedCorners.true...format")
            rc.set("attr", "corner-radius")
            rc.set("value", self.corner_radius)
        if self.margin:
            _sub(zs, "format", attr="margin", value=self.margin)
        if self.background_color:
            _sub(zs, "format", attr="background-color", value=self.background_color)
        if self.padding:
            _sub(zs, "format", attr="padding", value=self.padding)
        return zs


# Pre-built zone style constants (per validated reference patterns)
CONTAINER_ZONE_STYLE = ZoneStyle(
    border_color="#e0e0e0", border_style="solid", border_width="1",
    corner_radius="12", margin="6", background_color="#ffffff",
)
WORKSHEET_ZONE_STYLE = ZoneStyle(corner_radius="4")


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class MetadataRecord:
    remote_name: str
    remote_type: str
    local_name: str
    local_type: str
    aggregation: str
    ordinal: int


@dataclass
class ColumnDecl:
    name: str
    datatype: str       # string | real | integer | date
    role: str           # dimension | measure
    vtype: str          # nominal | ordinal | quantitative
    caption: str = ""
    default_format: str = ""
    semantic_role: str = ""
    calculation_formula: str = ""

    @property
    def is_dim(self) -> bool:
        return self.role == "dimension"

    @property
    def is_calc(self) -> bool:
        return bool(self.calculation_formula)


@dataclass
class ColumnInstance:
    column_name: str
    derivation: str     # None | Sum | Avg | Count | User
    inst_name: str      # [sum:revenue:qk]
    inst_type: str      # nominal | ordinal | quantitative


@dataclass
class DrillPath:
    name: str
    fields: list[str]


@dataclass
class Encoding:
    enc_type: str       # color | tooltip | text | size | wedge-size
    column_ref: str     # [ds].[inst]


@dataclass
class PaneStyle:
    mark_color: str = ""
    show_labels: bool = True
    cull_labels: bool = True
    cell_color: str = ""


@dataclass
class WorksheetModel:
    name: str
    ds_name: str
    ds_caption: str
    dep_columns: list[ColumnDecl] = field(default_factory=list)
    dep_instances: list[ColumnInstance] = field(default_factory=list)
    mark_class: str = "Bar"
    rows_ref: str = ""
    cols_ref: str = ""
    encodings: list[Encoding] = field(default_factory=list)
    pane_style: PaneStyle = field(default_factory=PaneStyle)
    customized_label: str = ""
    title_text: str = ""
    title_fontsize: int = 18
    # Table-level style (outside panes, before panes)
    table_style_rules: list[tuple[str, list[tuple[str, str]]]] = field(default_factory=list)
    # Stage-4 Cycle-4 — dual-axis combo emission. When `secondary_axis_ref`
    # is set, to_xml() emits TWO panes (id='0' for primary mark, id='1'
    # with y-axis-name binding to the secondary measure). The caller must
    # also set `rows_ref` to the validated `[primary] + [secondary]`
    # syntax (per visualizations-and-charts.md §"Dual Axis Chart") and
    # include both measure column-instances in `dep_instances`.
    secondary_mark_class: str = ""
    secondary_axis_ref: str = ""
    secondary_encodings: list[Encoding] = field(default_factory=list)

    def to_xml(self) -> etree._Element:
        ws = etree.Element("worksheet", name=self.name)

        # layout-options with title
        if self.title_text:
            lo = _sub(ws, "layout-options")
            title_el = _sub(lo, "title")
            ft = _sub(title_el, "formatted-text")
            run = _sub(ft, "run", self.title_text)
            run.set("bold", "true")
            run.set("fontalignment", "1")
            run.set("fontcolor", "#000000")
            run.set("fontsize", str(self.title_fontsize))

        table = _sub(ws, "table")

        # <view>
        view = _sub(table, "view")
        dss = _sub(view, "datasources")
        _sub(dss, "datasource", caption=self.ds_caption, name=self.ds_name)

        deps = _sub(view, "datasource-dependencies", datasource=self.ds_name)

        # ALL column declarations first, then ALL instances
        for col in self.dep_columns:
            attrs = {"datatype": col.datatype, "name": f"[{col.name}]",
                     "role": col.role, "type": col.vtype}
            if col.caption:
                attrs["caption"] = col.caption
            if col.default_format:
                attrs["default-format"] = col.default_format
            _sub(deps, "column", **attrs)

        for ci in self.dep_instances:
            _sub(deps, "column-instance",
                 column=f"[{ci.column_name}]",
                 derivation=ci.derivation,
                 name=ci.inst_name,
                 pivot="key",
                 type=ci.inst_type)

        _sub(view, "aggregation", value="true")

        # Table-level <style> (required before <panes> — always emit)
        style = _sub(table, "style")
        for rule_element, formats in self.table_style_rules:
            sr = _sub(style, "style-rule", element=rule_element)
            for attr_name, attr_val in formats:
                _sub(sr, "format", attr=attr_name, value=attr_val)

        # <panes>
        panes = _sub(table, "panes")
        pane = _sub(panes, "pane")
        pane.set("selection-relaxation-option", "selection-relaxation-allow")
        # Stage-4 Cycle-4: when dual-axis is active, primary pane needs id='0'
        # so the secondary pane can declare y-axis-name binding correctly.
        is_dual_axis = bool(self.secondary_axis_ref)
        if is_dual_axis:
            pane.set("id", "0")

        # pane > view > breakdown
        pv = _sub(pane, "view")
        _sub(pv, "breakdown", value="auto")

        # mark
        _sub(pane, "mark", **{"class": self.mark_class})
        _sub(pane, "mark-sizing")
        pane.find("mark-sizing").set("mark-sizing-setting", "marks-scaling-off")

        # encodings
        if self.encodings:
            enc_el = _sub(pane, "encodings")
            for enc in self.encodings:
                _sub(enc_el, enc.enc_type, column=enc.column_ref)

        # customized-label (for KPI sheets)
        # Multi-run output so embedded "\n" line breaks render — Tableau ignores
        # bare newlines inside a single run text node.
        # Default fontsize lowered to 18 (per kpi-cards-and-trends.md §12.2e —
        # 36pt overflows narrow KPI cards; 18-22pt is the safe range).
        if self.customized_label:
            cl = _sub(pane, "customized-label")
            ft = _sub(cl, "formatted-text")
            segments = self.customized_label.split("\n")
            for idx, segment in enumerate(segments):
                if idx > 0:
                    br = _sub(ft, "run")
                    br.text = "Æ\n"  # Æ + LF — Tableau line-break literal
                run = _sub(ft, "run")
                run.set("fontsize", "18")
                run.text = segment

        # pane-level <style>
        # mark-labels-show MUST be true when customized-label is set, otherwise
        # the label template loads but never renders (kpi-cards-and-trends.md §13).
        pane_style_el = _sub(pane, "style")
        needs_mark_rule = (
            self.pane_style.mark_color
            or self.pane_style.show_labels
            or bool(self.customized_label)
        )
        if needs_mark_rule:
            sr = _sub(pane_style_el, "style-rule", element="mark")
            if self.pane_style.mark_color:
                _sub(sr, "format", attr="mark-color", value=self.pane_style.mark_color)
            if self.pane_style.show_labels or self.customized_label:
                _sub(sr, "format", attr="mark-labels-show", value="true")
                if self.pane_style.cull_labels:
                    _sub(sr, "format", attr="mark-labels-cull", value="true")

        if self.pane_style.cell_color:
            sr = _sub(pane_style_el, "style-rule", element="cell")
            _sub(sr, "format", attr="font-size", value="9")
            _sub(sr, "format", attr="font-weight", value="bold")
            _sub(sr, "format", attr="color", value=self.pane_style.cell_color)
            _sub(sr, "format", attr="text-align", value="center")

        # pane sizing
        sr = _sub(pane_style_el, "style-rule", element="pane")
        for d in ("minheight", "maxheight", "minwidth", "maxwidth"):
            _sub(sr, "format", attr=d, value="-1")

        # Stage-4 Cycle-4 — secondary pane for dual-axis combo charts.
        # Emits the second pane referenced by the rows-shelf `(a + b)`
        # expression. The pattern follows the validated XML in
        # docs/tableau-twb/references/visualizations-and-charts.md
        # §"Dual Axis Chart" (pane id='1', y-axis-name binding, y-index='1').
        if is_dual_axis:
            pane2 = _sub(panes, "pane")
            pane2.set("id", "1")
            pane2.set("selection-relaxation-option", "selection-relaxation-allow")
            pane2.set("y-axis-name", self.secondary_axis_ref)
            pane2.set("y-index", "1")

            pv2 = _sub(pane2, "view")
            _sub(pv2, "breakdown", value="auto")

            _sub(pane2, "mark",
                 **{"class": self.secondary_mark_class or "Line"})
            ms2 = _sub(pane2, "mark-sizing")
            ms2.set("mark-sizing-setting", "marks-scaling-off")

            if self.secondary_encodings:
                enc_el2 = _sub(pane2, "encodings")
                for enc in self.secondary_encodings:
                    _sub(enc_el2, enc.enc_type, column=enc.column_ref)

            # Minimal pane-level style on pane 2 — just sizing so Tableau
            # doesn't reject for missing element. Mark color / labels stay
            # on the primary pane.
            pane2_style_el = _sub(pane2, "style")
            sr2 = _sub(pane2_style_el, "style-rule", element="pane")
            for d in ("minheight", "maxheight", "minwidth", "maxwidth"):
                _sub(sr2, "format", attr=d, value="-1")

        # rows / cols
        rows_el = _sub(table, "rows")
        rows_el.text = self.rows_ref if self.rows_ref else None
        cols_el = _sub(table, "cols")
        cols_el.text = self.cols_ref if self.cols_ref else None

        # simple-id
        _sub(ws, "simple-id", uuid=_new_uuid())

        return ws


@dataclass
class FilterAction:
    caption: str
    source_sheet: str
    target_sheet: str
    trigger: str = "on-select"
    all_fields: bool = True

    def to_xml(self) -> etree._Element:
        fa = etree.Element("filter-action",
                           caption=self.caption,
                           name=self.caption)
        _sub(fa, "activation", type=self.trigger)
        _sub(fa, "source", sheet=self.source_sheet, type="sheet")
        _sub(fa, "target", sheet=self.target_sheet, type="sheet")
        if self.all_fields:
            _sub(fa, "fields", type="all")
        return fa


@dataclass
class Zone:
    zone_id: int
    zone_type: str      # layout-basic | layout-flow | text (worksheet zones have no type)
    w: int
    h: int
    x: int = 0
    y: int = 0
    param: str = ""     # horz | vert (for layout-flow)
    name: str = ""      # sheet name for worksheet zones
    show_caption: bool = True
    children: list[Zone] = field(default_factory=list)
    text_content: str = ""
    text_fontsize: int = 16
    text_bold: bool = True
    # For filter zones
    is_filter: bool = False
    filter_param: str = ""
    # Styling
    friendly_name: str = ""  # layout-flow containers only
    zone_style: ZoneStyle | None = None

    def to_xml(self) -> etree._Element:
        attrs = {
            "h": str(self.h),
            "id": str(self.zone_id),
            "w": str(self.w),
            "x": str(self.x),
            "y": str(self.y),
        }
        if self.name:
            attrs["name"] = self.name
        if self.is_filter:
            attrs["type-v2"] = "filter"
            attrs["param"] = self.filter_param
            attrs["show-caption"] = "true"
        elif self.zone_type == "text":
            attrs["type-v2"] = "text"
        elif self.zone_type:
            attrs["type-v2"] = self.zone_type
            if self.param:
                attrs["param"] = self.param

        if self.friendly_name and self.zone_type in ("layout-basic", "layout-flow"):
            attrs["friendly-name"] = self.friendly_name

        if not self.show_caption and not self.is_filter:
            attrs["show-caption"] = "false"

        zone = etree.Element("zone", **attrs)

        # Text zone content
        if self.zone_type == "text" and self.text_content:
            ft = _sub(zone, "formatted-text")
            run = _sub(ft, "run", self.text_content)
            if self.text_bold:
                run.set("bold", "true")
            run.set("fontalignment", "1")
            run.set("fontcolor", "#000000")
            run.set("fontsize", str(self.text_fontsize))

        # Children first, zone-style LAST (required by spec)
        for child in self.children:
            zone.append(child.to_xml())

        if self.zone_style and not self.zone_style.is_empty():
            zone.append(self.zone_style.to_xml())

        return zone


@dataclass
class DashboardModel:
    name: str
    width: int = 1400
    height: int = 900
    root_zone: Zone | None = None
    actions: list[FilterAction] = field(default_factory=list)

    def to_xml(self) -> etree._Element:
        """Per Tableau's content model:
        (layout-options? | repository-location?), style, size?,
        datasources, datasource-dependencies*, zones, devicelayouts, simple-id.
        <actions> is NOT allowed inside <dashboard>."""
        dash = etree.Element("dashboard", name=self.name)

        style = _sub(dash, "style")
        sr = _sub(style, "style-rule", element="table")
        _sub(sr, "format", attr="background-color", value="#f0f0f0")

        _sub(dash, "size",
             maxheight=str(self.height), maxwidth=str(self.width),
             minheight=str(self.height), minwidth=str(self.width))

        if self.root_zone:
            zones_el = _sub(dash, "zones")
            zones_el.append(self.root_zone.to_xml())

        _sub(dash, "simple-id", uuid=_new_uuid())

        return dash


@dataclass
class DatasourceModel:
    name: str
    caption: str
    hyper_path: str
    metadata_records: list[MetadataRecord] = field(default_factory=list)
    columns: list[ColumnDecl] = field(default_factory=list)
    calculated_columns: list[ColumnDecl] = field(default_factory=list)
    drill_paths: list[DrillPath] = field(default_factory=list)
    aliases_enabled: bool = True
    # EQ-102 B2b: when set, emit a textscan (live CSV) connection instead of
    # the legacy hyper-template ref. `csv_filename` is the basename used both
    # for the textscan filename attribute and to derive the relation table
    # name ("<stem>#csv"). The CSV itself must be bundled at
    # Data/Datasources/<csv_filename> by the packager (engine/packager.py).
    csv_filename: str | None = None

    def to_xml(self) -> etree._Element:
        """Guaranteed order: connection → aliases → columns → calcs → drill-paths → layout"""
        ds = etree.Element("datasource",
                           caption=self.caption,
                           inline="true",
                           name=self.name,
                           version="18.1")

        # 1. connection + metadata-records
        conn = _sub(ds, "connection")
        conn.set("class", "federated")

        ncs = _sub(conn, "named-connections")

        if self.csv_filename:
            # EQ-102 B2b: textscan connection pointing at the user's CSV
            # bundled inside the .twbx at Data/Datasources/<csv_filename>.
            import os as _os
            csv_stem = _os.path.splitext(self.csv_filename)[0]
            rel_name = f"{csv_stem}#csv"
            rel_table = f"[{rel_name}]"
            parent_name = f"[{rel_name}]"
            leaf_name = "csv_leaf"

            nc = _sub(ncs, "named-connection", caption="data", name=leaf_name)
            inner = _sub(nc, "connection")
            inner.set("class", "textscan")
            # When .twbx is unpacked, the CSV sits at <unpack>/Data/Datasources/<filename>.
            # Tableau's textscan loader uses `directory` as the directory portion
            # and `filename` as the leaf name — embedding the sub-path in
            # `filename` makes Tableau strip it and look for the file directly
            # under the temp dir (error 88A6ADA0 "file not found"). Split the
            # path correctly.
            inner.set("directory", "Data/Datasources")
            inner.set("filename", self.csv_filename)
            inner.set("password", "")
            inner.set("server", "")

            rel = _sub(conn, "relation",
                       connection=leaf_name, name=rel_name,
                       table=rel_table, type="table")
            # EQ-102 B2b: textscan relations need the column schema declared
            # inline (header='yes' outcome='2'). Without it Tableau Desktop
            # refuses with Internal Error DD3C47AE on first open.
            # Derive from metadata_records — they already carry the schema.
            if self.metadata_records:
                cols_el = _sub(rel, "columns",
                               **{"header": "yes", "outcome": "2"})
                for mr in self.metadata_records:
                    _sub(cols_el, "column",
                         datatype=mr.local_type,
                         name=mr.remote_name,
                         ordinal=str(mr.ordinal))
        else:
            # Legacy: hyper-template ref (reserved for future sample DB feature).
            parent_name = "[Extract]"
            leaf_name = "hyper_leaf"

            nc = _sub(ncs, "named-connection", caption="data", name=leaf_name)
            inner = _sub(nc, "connection")
            inner.set("class", "hyper")
            inner.set("dbname", self.hyper_path)
            inner.set("schema", "Extract")
            inner.set("tablename", "Extract")

            rel = _sub(conn, "relation",
                       connection=leaf_name, name="Extract",
                       table="[Extract].[Extract]", type="table")

        if self.metadata_records:
            mrs = _sub(conn, "metadata-records")
            for mr in self.metadata_records:
                rec = _sub(mrs, "metadata-record")
                rec.set("class", "column")
                _sub(rec, "remote-name", mr.remote_name)
                _sub(rec, "remote-type", mr.remote_type)
                _sub(rec, "local-name", mr.local_name)
                _sub(rec, "parent-name", parent_name)
                _sub(rec, "remote-alias", mr.remote_name)
                _sub(rec, "ordinal", str(mr.ordinal))
                _sub(rec, "local-type", mr.local_type)
                _sub(rec, "aggregation", mr.aggregation)
                _sub(rec, "contains-null", "true")

        # 2. aliases
        if self.aliases_enabled:
            _sub(ds, "aliases", enabled="yes")

        # 3. raw columns (dims first, then measures — matching convention)
        for col in self.columns:
            attrs = {
                "caption": col.caption,
                "datatype": col.datatype,
                "name": f"[{col.name}]",
                "role": col.role,
                "type": col.vtype,
            }
            if col.default_format:
                attrs["default-format"] = col.default_format
            if col.semantic_role:
                attrs["semantic-role"] = col.semantic_role
            _sub(ds, "column", **attrs)

        # 4. calculated columns
        for col in self.calculated_columns:
            attrs = {
                "caption": col.caption,
                "datatype": col.datatype,
                "name": f"[{col.name}]",
                "role": col.role,
                "type": col.vtype,
            }
            if col.default_format:
                attrs["default-format"] = col.default_format
            col_el = _sub(ds, "column", **attrs)
            _sub(col_el, "calculation", **{"class": "tableau", "formula": col.calculation_formula})

        # 5. drill-paths
        if self.drill_paths:
            dps = _sub(ds, "drill-paths")
            for dp in self.drill_paths:
                dp_el = _sub(dps, "drill-path", name=dp.name)
                for f in dp.fields:
                    _sub(dp_el, "field", f"[{f}]")

        # 6. layout
        _sub(ds, "layout", **{
            "dim-ordering": "alphabetic",
            "measure-ordering": "alphabetic",
            "show-structure": "true",
        })

        # 7. style (required after layout per content model)
        _sub(ds, "style")

        return ds


@dataclass
class WorkbookModel:
    datasource: DatasourceModel
    worksheets: list[WorksheetModel] = field(default_factory=list)
    dashboard: DashboardModel | None = None
    palette_name: str = ""
    palette_colors: list[str] = field(default_factory=list)

    def render(self) -> str:
        """Full .twb XML string. Element order guaranteed:
        manifest → preferences → datasources → worksheets → dashboards → windows"""
        nsmap = {"user": "http://www.tableausoftware.com/xml/user"}
        root = etree.Element("workbook", nsmap=nsmap)
        root.set("original-version", "18.1")
        root.set("source-build", "2024.3.1 (20243.24.1112.0850)")
        root.set("source-platform", "mac")
        root.set("version", "18.1")

        # 1. document-format-change-manifest
        manifest = _sub(root, "document-format-change-manifest")
        for flag in MANIFEST_FLAGS:
            _sub(manifest, flag)

        # 2. preferences
        prefs = _sub(root, "preferences")
        _sub(prefs, "preference", name="ui.encoding.shelf.height", value="24")
        _sub(prefs, "preference", name="ui.shelf.height", value="26")
        if self.palette_name and self.palette_colors:
            cp = _sub(prefs, "color-palette", name=self.palette_name, type="ordered-diverging")
            for c in self.palette_colors:
                _sub(cp, "color", c)

        # 3. workbook-level style (required element before datasources)
        _sub(root, "style")

        # 4. datasources
        dss = _sub(root, "datasources")
        dss.append(self.datasource.to_xml())

        # 4. worksheets
        wss = _sub(root, "worksheets")
        for ws in self.worksheets:
            wss.append(ws.to_xml())

        # 5. dashboards
        if self.dashboard:
            dashboards = _sub(root, "dashboards")
            dashboards.append(self.dashboard.to_xml())

        # 6. windows
        windows = _sub(root, "windows")
        windows.set("source-height", "72")

        if self.dashboard:
            dw = _sub(windows, "window")
            dw.set("class", "dashboard")
            dw.set("maximized", "true")
            dw.set("name", self.dashboard.name)
            vps = _sub(dw, "viewpoints")
            for ws in self.worksheets:
                _sub(vps, "viewpoint", name=ws.name)
            _sub(dw, "active", id="-1")

        # Worksheet windows with cards and highlight
        dim_refs = []
        for col in self.datasource.columns:
            if col.is_dim and col.datatype != "date":
                dim_refs.append(
                    f"[{self.datasource.name}].[none:{col.name}:nk]"
                )

        for ws in self.worksheets:
            ww = _sub(windows, "window")
            ww.set("class", "worksheet")
            ww.set("name", ws.name)

            cards = _sub(ww, "cards")
            left = _sub(cards, "edge", name="left")
            strip_l = _sub(left, "strip", size="160")
            _sub(strip_l, "card", type="pages")
            _sub(strip_l, "card", type="filters")
            _sub(strip_l, "card", type="marks")

            top = _sub(cards, "edge", name="top")
            s1 = _sub(top, "strip", size="2147483647")
            _sub(s1, "card", type="columns")
            s2 = _sub(top, "strip", size="2147483647")
            _sub(s2, "card", type="rows")
            s3 = _sub(top, "strip", size="31")
            _sub(s3, "card", type="title")

            vp = _sub(ww, "viewpoint")
            hl = _sub(vp, "highlight")
            cow = _sub(hl, "color-one-way")
            for dr in dim_refs:
                _sub(cow, "field", dr)

            _sub(ww, "simple-id", uuid=_new_uuid())

        # NOTE: <actions> emission is intentionally disabled. Generated TWBs use a stricter
        # schema than Desktop-saved files: only <edit-parameter-action> is documented as a
        # validated <actions> child (programmatic-twb-learnings §25.1). Generic filter actions
        # caused load error D2E8DA72 ("no declaration found for element 'filter-action'").
        # Users can add filter actions in Tableau Desktop after opening the workbook.

        body = etree.tostring(root, encoding="unicode", pretty_print=True)
        return "<?xml version='1.0' encoding='utf-8' ?>\n" + body
