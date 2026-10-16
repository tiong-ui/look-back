# 回望 Look Back

An interactive history map centred on **Taiwan**, starting with **Asia**.
以臺灣為中心的互動歷史地圖。

- 🗺️ World map centred on Taiwan: zoom, six map styles (light, streets, dark, terrain, satellite, historical), 3D terrain, globe view
- 🕰️ Timeline from **30,000 BC to 2026**, with era presets, typed years (`西元前200`, `民國50`) and a play button
- 📜 Side panel of major events in the selected range, filtered by importance, category, place or map view
- 📍 Events linked to their places (with movement arcs) and to related events
- 🧭 Written from a Taiwan-centred view, with other perspectives listed for contested events
- 🇹🇼 Traditional Chinese by default, English toggle

**Live site:** https://tiong-ui.github.io/look-back/ (after GitHub Pages is enabled, see below)

## Develop

```bash
npm install
npm run dev        # http://localhost:5173/look-back/
npm test           # unit tests (time handling, queries, data validation)
npm run build      # type-check, validate data, build to dist/
```

Node 20 or newer.

## Content

Every event, place, era and reference is one YAML file in [`data/`](data/), whether written by hand, entered in the CMS, or imported from Wikidata.

- **管理介面 / Admin:** https://tiong-ui.github.io/look-back/admin/ : add and edit events (e.g. from books) with forms. See the [操作手冊 / admin guide](docs/ADMIN.md).
- [Data guide](docs/DATA.md): file formats and how the Wikidata import merges with your edits.
- [Editorial guidelines](docs/EDITORIAL.md): wording and perspectives.

## Setup on GitHub (one time)

1. **Pages:** Settings → Pages → Source: **GitHub Actions**. Every push to `main` then deploys automatically.
2. **Importance scores:** Actions → **Refresh importance** → *Run workflow*. It computes event importance from Wikipedia and then runs monthly.
3. **Import events:** Actions → **Import events from Wikidata** → *Run workflow*. It opens a pull request with events in Asia from Wikidata (see the [data guide](docs/DATA.md#imported-events自動匯入)). For it to open the pull request itself, allow Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests".

## Docs

- [Proposal](docs/PROPOSAL.md): product and technical design, decisions, roadmap
- [Data guide](docs/DATA.md)
- [Admin guide (中文)](docs/ADMIN.md)
- [Editorial guidelines](docs/EDITORIAL.md)

## Credits

Map data © OpenStreetMap contributors, OpenFreeMap, CARTO, OpenTopoMap; terrain from Mapzen / AWS Terrain Tiles; satellite imagery Sentinel-2 cloudless by EOX (non-commercial use). Code: MIT. Curated data: CC BY-SA 4.0.
