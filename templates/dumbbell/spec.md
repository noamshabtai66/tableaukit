# Dumbbell Chart — Build Spec

## What this chart shows

A horizontal dumbbell chart comparing **Sales 2025 vs Sales 2026** per region.
Each region has two dots (one per year) connected by a line — the line
length shows the magnitude of change.

## Sample data

`sample.csv` — 8 regions, 2 numeric columns (`Sales_2025`, `Sales_2026`).

```
Region,Sales_2025,Sales_2026
North America,452.3,498.7
EMEA,389.1,421.4
APAC,267.5,308.9
LATAM,198.2,215.6
China,145.8,178.3
Japan,134.6,142.1
MENA,98.4,113.7
India,87.2,127.5
```

## How to build in Tableau Desktop (Tableau 2024+)

### Step 1 — Connect the data

1. Open Tableau Desktop
2. **Connect** → **Text file** → choose `sample.csv`
3. You should see 1 table with 3 fields: `Region`, `Sales 2025`, `Sales 2026`

### Step 2 — Build the dumbbell

1. Drag **`Sales 2025`** to **Columns**
2. Drag **`Sales 2026`** to **Columns** (same shelf, next to `Sales 2025`)
3. Drag **`Region`** to **Rows**
4. Now you have 2 separate bar charts side by side. We want one chart with dots.

### Step 3 — Combine via dual-axis

1. Right-click on the **second** `SUM(Sales 2026)` axis (the right one)
2. Choose **Dual Axis**
3. Right-click again on `SUM(Sales 2026)` axis → **Synchronize Axis**
4. Now both measures share one axis.

### Step 4 — Change marks to circles

1. In the **Marks** card, you now see 3 tabs: **All**, **SUM(Sales 2025)**, **SUM(Sales 2026)**
2. Click **SUM(Sales 2025)** tab → change mark type from **Automatic** to **Circle** → size up (~12)
3. Click **SUM(Sales 2026)** tab → change mark type to **Circle** → size up (~12) → make color different (e.g. dark blue for 2026, light blue for 2025)

### Step 5 — Add the connecting line (this is the trick)

1. Drag **`Measure Values`** to **Columns** (it shows up in the dropdown)
2. Tableau adds a third axis. Set its mark type to **Line**.
3. On the Line marks card: drag **Measure Names** to **Path** (this tells Tableau to draw line from 2025 to 2026 for each row)
4. Right-click the line axis → **Dual Axis** with one of the circles → synchronize

   _Tip: if the line doesn't connect properly, you may need to make Measure Names a discrete dimension on the line tab only._

### Step 6 — Polish

1. **Sort** Region by `Sales 2026` descending (right-click Region → Sort → Field → Sales 2026 → Sum → Descending)
2. Hide the redundant axis headers (right-click axis → uncheck "Show Header")
3. Add a **Tooltip** showing region + both values
4. Title: "Regional sales: 2025 vs 2026"
5. Format the dollar values as currency ($M)

### Step 7 — Save

1. **File** → **Save As** → choose `template.twbx` (Tableau Packaged Workbook)
2. Save to this folder: `~/Developer/projects/tableaukit/templates/dumbbell/template.twbx`
3. Make sure it's `.twbx` (packaged) not `.twb` (XML only) — `.twbx` includes the CSV inline.

## When you're done

Tell me "dumbbell ready" and I'll:

1. Read the XML from the `.twbx`
2. Write `annotation.md` (line-by-line walkthrough of the key XML)
3. Upload `.twbx` + `sample.csv` to Supabase Storage
4. Insert a row into `tk_templates` with `is_published=true`
5. You'll see it live at `/templates/dumbbell`

## Visual reference (what you're building)

```
Region                        Sales ($M)
                       0    100    200    300    400    500
North America                                  ●─────●     ← 452→499
EMEA                                    ●───●                 389→421
APAC                          ●─────●                         268→309
LATAM                 ●──●                                    198→216
China           ●─────●                                       146→178
Japan           ●●                                            135→142
MENA          ●●                                              98→114
India       ●────────●                                        87→128 ★ strongest growth

Legend: ● 2025   ● 2026
```
