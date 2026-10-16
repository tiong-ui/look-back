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

All events, places, eras and resource links are YAML files in [`data/`](data/). See the [data guide](docs/DATA.md) for how to add or edit them, and the [editorial guidelines](docs/EDITORIAL.md) for wording and perspectives. The reference list shown in the app is [`data/resources.yaml`](data/resources.yaml).

## Setup on GitHub (one time)

1. **Pages:** Settings → Pages → Source: **GitHub Actions**. Every push to `main` then deploys automatically.
2. **Importance scores:** Actions → **Refresh importance** → *Run workflow*. It computes event importance from Wikipedia and then runs monthly.

## Docs

- [Proposal](docs/PROPOSAL.md): product and technical design, decisions, roadmap
- [Data guide](docs/DATA.md)
- [Editorial guidelines](docs/EDITORIAL.md)

## Credits

Map data © OpenStreetMap contributors, OpenFreeMap, CARTO, OpenTopoMap; terrain from Mapzen / AWS Terrain Tiles; satellite imagery Sentinel-2 cloudless by EOX (non-commercial use). Code: MIT. Curated data: CC BY-SA 4.0.
