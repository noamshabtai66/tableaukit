# TableauKit

> Tableau templates with the XML explained.

An open-source library of canonical Tableau `.twbx` visualization templates — sankey, hex map, sparkline strip, dumbbell, bullet, waterfall, gantt — each shipping with a working `.twbx`, a sample CSV that opens cleanly in Tableau Desktop, and **line-by-line XML annotation** so you understand exactly how it works.

## Why

Every other Tableau template gallery (Flerlage Chart Catalog, Andy Kriebel's Visual Vocabulary, Workout Wednesday) gives you a `.twbx` and stops. Nobody explains the XML underneath — which `<calculation>` element creates the sankey curve, why a particular `<column-instance>` key matters, how dual-axis wiring actually works. That gap is what TableauKit fills.

## Status

🚧 Early development. v0.1 ships 10 templates and an MCP server.

## Stack

Astro 5 + MDX · Tailwind CSS · Public Sans + JetBrains Mono.

## Local dev

```bash
npm install
npm run dev
```

## License

MIT.
