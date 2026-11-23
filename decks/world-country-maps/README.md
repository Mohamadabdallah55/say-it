# خمن الدولة المظللة — خرائط العالم

100 challenge maps, divided into **30 easy (200 points), 30 medium (400), and 40 hard (600)**.

- Each image is a 320×220 PNG. One actual national polygon is colored orange; surrounding countries are neutral gray with visible borders.
- **No country names, city names, sea labels, flags, abbreviations, captions, or hints appear inside the pictures.**
- Each image is matched to exactly one answer by ISO 3166-1 alpha-3 code in the question data.
- The deck uses `schemaVersion: 2` and the official lobby group `menuGroup: "world"`.
- Questions and photos load through `decks/index.json` and are cached offline by the app.
- Pictures are rasterized deterministically by `scripts/countryMapRasterizer.js` from the simplified geographic outlines at [D3 Graph Gallery world.geojson](https://github.com/holtzy/D3-graph-gallery/blob/master/DATA/world.geojson), based on Natural Earth map data.

**Geographic note:** Political outlines are generalized for gameplay; some very small islands and disputed-border details are absent from the 1:110m source. These are puzzle illustrations, not authoritative legal boundary maps.

To update this bank, edit `deck.json`, then increment its `version` in `decks/index.json`.
