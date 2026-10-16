# Look Back（回望）: Product & Technical Proposal

| | |
|---|---|
| **Status** | v0.2: decisions recorded (§11); Phase 0 and most of Phase 1 built |
| **Date** | 2026-10-16 |
| **Scope** | MVP (Asia, centred on Taiwan, 30,000 BC to AD 2026) plus a roadmap for later phases |

---

## 1. Vision

*Look Back* is a web app for exploring history by **place and time together**. A user picks a span of years on a timeline and sees two things: which major events happened in that span, and **where** they happened. The view starts from Taiwan, at the centre of the map, and widens out to East Asia, Asia, and eventually the whole world.

### Goals
1. Show the world map with **Taiwan at the centre**, with smooth zoom and pan.
2. Let users **switch map styles**: streets/light, dark, terrain (hillshade + 3D relief), satellite, and a muted "historical" style.
3. Provide a **date-range slider** at the bottom of the screen, covering **30,000 BC to AD 2026** (prehistory included; the default view is 1 BC to AD 2026).
4. Show the **major historical events** in the selected range in a **sidebar table**.
5. Link **events ↔ locations** (and **events ↔ events**) both on the map and in the table.
6. Support **Traditional Chinese (zh-TW)** first, with **English** as the second language.

### Non-goals for the MVP
- Accurate historical borders for every year. These come in Phase 3; see §9.
- User accounts, user-submitted content, and a backend server.
- Coverage of the whole world. The MVP covers Asia, with a few world events added for context.

---

## 2. Users & key scenarios

| User | Scenario |
|---|---|
| Student | "What was happening around Taiwan during the Tang dynasty?" Drags the slider to 618–907 and reads the event list. |
| Curious reader | Clicks **Battle of Fort Zeelandia (1661–62)**. The map flies to Tainan, draws Koxinga's route from Xiamen, and shows the related events (Dutch Formosa, Kingdom of Tungning). |
| Teacher | Shares a link such as `…/?from=1895&to=1945&style=terrain` that opens directly on Taiwan under Japanese rule. |
| Explorer | Zooms into Japan and clicks the Kyoto marker. The sidebar filters down to the events that happened there. |

---

## 3. UX design

### 3.1 Layout (desktop)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  回望 Look Back          [Search events…]         [中文|EN]  [Style ▾] ⓘ │
├───────────────────────────────────────────────────┬──────────────────────┤
│                                                   │ Events  1661 – 1683  │
│                                                   │ ──────────────────── │
│                 MAP (MapLibre)                    │ ▸ 1661 Siege of Fort │
│                                                   │   Zeelandia   ●●●●○  │
│           Japan ●                                 │   📍Tainan · Xiamen  │
│        ● Xiamen ╲                                 │ ▸ 1662 Dutch leave   │
│                  ╲──▶ ● Tainan  (Taiwan centred)  │   Taiwan             │
│      ● Manila                                     │ ▸ 1683 Battle of     │
│                                                   │   Penghu      ●●●●○  │
│                                         [+]       │ ──────────────────── │
│                                         [−]       │ Filters: ☑Politics   │
│                                         [⌖ TW]    │ ☑War ☑Culture ☑Trade │
├───────────────────────────────────────────────────┴──────────────────────┤
│ ▁▂▃▁▁▂▅▃▂▁▂▃▅▆▇█▇▆▅▆▇██  ← event-density histogram                        │
│ ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━● │
│ 1 BC     500       1000       1500     1800    1900    2000    2026      │
│ Presets: [Han] [Tang] [Song] [Ming] [Qing] [Dutch Formosa] [Japanese era]│
│          [ROC] [Custom…]   From [ 1661 ] To [ 1683 ]   ▶ Play            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Layout (mobile)
- The map fills the screen. The timeline is a compact strip at the bottom.
- The event list lives in a **bottom sheet** that the user drags up: peek, half, or full height.
- The style switcher and language toggle sit in a floating menu.

### 3.3 Map
- **Initial view:** centre `[120.96, 23.70]` (central Taiwan), zoom about 4, which shows East Asia from Japan to Southeast Asia.
- **"Re-centre on Taiwan" button (⌖ TW)** is always available.
- **Zoom range:** 1 to 16. At zoom ≤ 2 the map can switch to **globe projection** (MapLibre v5 supports this), so the world view is not distorted.
- **Map styles** (the switcher shows a thumbnail for each):

  | Style | Purpose | Source (free / open) |
  |---|---|---|
  | Light (default) | Clean background that keeps event markers readable | OpenFreeMap "Positron" vector tiles |
  | Streets | Full detail | OpenFreeMap "Liberty" / "Bright" |
  | Dark | Night mode | OpenFreeMap dark / custom |
  | **Terrain** | Hillshade + optional **3D relief** (tilt with right-drag) | AWS Terrain Tiles (Terrarium DEM, open data) |
  | Satellite | Real imagery | EOX Sentinel-2 Cloudless (free for non-commercial use, which this project is) |
  | Historical (muted) | Sepia-toned, **no modern borders or labels**, so modern borders don't make past events misleading | Custom style built on the same vector tiles |

- Separate **layer toggles**, independent of the base style: Terrain relief on/off, Modern borders on/off, Place labels on/off, and later Historical borders (Phase 3).

### 3.4 Timeline slider
- **Dual-handle range slider** covering **−29999 to 2026** in astronomical years, i.e. 30,000 BC to AD 2026 (see §5.3 for how year 0 / 1 BC is handled). The page opens on 1 BC – 2026.
- **Non-linear scale.** Recorded history is much denser in recent centuries, so the axis is piecewise: 30,000–4000 BC takes 7 % of the width, 4000–1 BC 10 %, AD 1–1000 19 %, 1000–1600 22 %, 1600–1900 22 %, and 1900–2026 20 %. Taiwan's written history (1600 onwards) gets about 42 %.
- An **event-density histogram** above the track shows where events are concentrated.
- **Era presets** set the range in one click. There are two groups:
  - *Taiwan:* Prehistoric/Austronesian, Dutch & Spanish Formosa (1624–1662), Kingdom of Tungning (1661–1683), Qing rule (1683–1895), Japanese rule (1895–1945), Republic of China (1945–).
  - *China/Asia:* Han, Three Kingdoms, Tang, Song, Yuan, Ming, Qing; Japanese periods (Nara, Heian, Edo, Meiji…); Korean kingdoms, and others.
- **Direct input** boxes for exact years. These accept `200 BC`, `-200`, `西元前200`, and `民國50` (= 1961).
- **▶ Play** animates a fixed-width window (for example 50 years) along the timeline. Events fade in and out on the map as it moves.
- **Keyboard:** arrow keys move a handle by 1 year, Shift+arrow by 10, PageUp/PageDown by 100.

### 3.5 Sidebar event table
- **Columns:** Year(s) · Title · Category icon · Importance (●●●●○) · Locations.
- **Sorting** by year (default) or importance. **Filters** by category, by region, and by "only events in current map view".
- **Showing only *major* events.** A wide range such as 1 BC–2026 could hold thousands of events. The table shows the **top N by importance** (for example 100) and lowers the importance threshold as the range gets narrower:
  - Range > 1,000 years → importance ≥ 4
  - Range 200–1,000 years → importance ≥ 3
  - Range 50–200 years → importance ≥ 2
  - Range < 50 years → all events
  - A "Show all" toggle overrides this.
- **Row expand** shows a summary, the date precision, the locations (each one clickable), related events, an image (optional), and sources such as Wikipedia links.
- **Virtualised** list, so long lists stay smooth.

### 3.6 Event ↔ location ↔ event relationships (the core interaction)

| Action | Result |
|---|---|
| Hover over a table row | The event's markers **pulse** on the map |
| Click a table row | The map **flies to fit** all of the event's locations. Markers are highlighted, and **relation lines** are drawn (see below) |
| Click a map marker (a place) | A popup lists events at that place in the current range. The sidebar can filter to that place |
| Click a related event in the details | The table jumps to that event and the map updates |

**How each relation type is drawn on the map:**

| Location role | Visual |
|---|---|
| `primary` (where it happened) | Solid, large marker |
| `secondary` (also involved) | Smaller hollow marker |
| `origin` → `destination` (expeditions, migrations, trade) | **Curved arrow/arc** (great-circle), animated dashes |
| `area` (a region or battlefield extent) | Translucent polygon |

**Event ↔ event relation types:** `causes`, `caused_by`, `part_of`, `has_part`, `precedes`, `follows`, `related`. These appear in the expanded row as chips. When "Show connections" is on, they can also be drawn as faint links between the events' primary locations.

**Map density:** markers are **clustered** at low zoom. A cluster shows a count and a colour for its dominant category.

---

## 4. Architecture

```
┌────────────────────────── Browser (static SPA) ───────────────────────────┐
│                                                                           │
│  React UI ──── Zustand store (timeRange, selectedEventId, filters,        │
│   │  │          mapStyle, layers, lang)  ◀──▶  URL query-string sync      │
│   │  │                                                                    │
│   │  └─ Sidebar (event list, filters, details)                            │
│   ├──── Timeline (custom range slider + histogram, D3 scales)             │
│   └──── MapView (MapLibre GL JS)                                          │
│            sources: events.geojson, relations.geojson, DEM, base tiles    │
│                                                                           │
│  Data layer: fetch /data/*.json → indexed in memory (sorted by start year,│
│              interval index for range queries, place → events map)       │
└───────────────────────────────────────────────────────────────────────────┘
         ▲ static files                        ▲ tiles (3rd-party, free)
   GitHub Pages / Cloudflare Pages      OpenFreeMap · AWS Terrain · EOX/Esri
```

- **No backend for the MVP.** All events ship as static JSON. A few thousand events take roughly 1–2 MB, or about 300 KB gzipped, and this can be split by century if it grows.
- **Range queries** run in memory. Events are sorted by start year and checked for overlap (`event.start ≤ to && event.end ≥ from`). This is fast enough for 10⁴ events. For larger datasets the plan is an interval tree or MapLibre filter expressions.
- **Map filtering:** the event GeoJSON is loaded once. Changes to the time range update a MapLibre `filter` expression on the layer instead of re-uploading data, so the slider stays smooth at 60 fps.

### 4.1 Tech stack

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite** + **TypeScript** | Fast, simple, static output |
| UI | **React 18** | Large ecosystem, familiar to most contributors |
| Map | **MapLibre GL JS v5** | Open source, no API key, vector tiles, 3D terrain, globe |
| State | **Zustand** | Small, works well with URL sync |
| Table | Plain React list | Enough for a few hundred events; TanStack Virtual can be added when the list grows |
| Timeline | Custom component with its own piecewise scale | Needs a non-linear axis and a histogram, which off-the-shelf sliders don't support |
| i18n | Small built-in dictionary (`src/i18n`) | Two languages don't need a library yet; i18next later if more are added |
| Styling | Plain CSS with design tokens | No build-time CSS dependency |
| Data validation | **Zod** schemas + a CI script | Catches broken data before deploy |
| Tests | **Vitest** (logic), **Playwright** (E2E smoke) | |
| Lint/format | ESLint + Prettier | |
| CI/CD | **GitHub Actions** → **GitHub Pages** | Free, deploys on every push to `main` |

### 4.2 Proposed repository layout

```
look-back/
├─ docs/                    # proposal, data guide, ADRs
├─ data/
│  ├─ events/               # one YAML file per era/region, human-editable
│  │  ├─ taiwan.yaml
│  │  ├─ china.yaml
│  │  ├─ japan-korea.yaml
│  │  └─ southeast-asia.yaml
│  ├─ places.yaml           # gazetteer: id, names, coords, geometry
│  └─ eras.yaml             # timeline presets
├─ scripts/
│  ├─ build-data.ts         # YAML → validated, minified JSON + GeoJSON
│  ├─ validate-data.ts      # schema + referential integrity checks
│  └─ import-wikidata.ts    # (Phase 2) SPARQL → draft YAML for curation
├─ public/data/             # generated (git-ignored)
├─ src/
│  ├─ components/{Map,Timeline,Sidebar,StyleSwitcher,…}
│  ├─ map/styles/           # style JSON definitions
│  ├─ store/                # Zustand + URL sync
│  ├─ lib/{time,query,geo}  # year handling, range index, arcs
│  ├─ i18n/{zh-TW,en}.json
│  └─ main.tsx
└─ .github/workflows/{ci,deploy}.yml
```

---

## 5. Data model

### 5.1 Event

```yaml
- id: siege-of-fort-zeelandia
  title:
    zh-TW: 熱蘭遮城之役
    en: Siege of Fort Zeelandia
  summary:
    zh-TW: 鄭成功率軍圍攻荷蘭東印度公司據點熱蘭遮城，九個月後荷軍投降，結束荷蘭在臺統治。
    en: Koxinga's forces besieged the Dutch East India Company's Fort Zeelandia; after nine months the Dutch surrendered, ending Dutch rule in Taiwan.
  start: { year: 1661, month: 4, day: 30 }
  end:   { year: 1662, month: 2, day: 1 }
  precision: day            # day | month | year | decade | century
  approximate: false
  categories: [war, politics]
  importance: 4             # 1 (minor) … 5 (world-defining)
  regions: [taiwan, east-asia]
  locations:
    - { place: tainan-anping, role: primary }
    - { place: xiamen,        role: origin }
    - { place: tainan-anping, role: destination }
  relations:
    - { event: dutch-formosa,        type: part_of }
    - { event: kingdom-of-tungning,  type: causes }
  sources:
    - { label: Wikipedia, url: "https://en.wikipedia.org/wiki/Siege_of_Fort_Zeelandia" }
  wikidata: Q…              # optional Wikidata ID; used for enrichment and de-duplication
  image: null
```

### 5.2 Place (gazetteer)

Place names change over time, so a place stores **names valid for each period**:

```yaml
- id: tainan-anping
  coords: [120.1606, 23.0016]      # [lng, lat]
  geometry: null                   # optional GeoJSON for areas
  names:
    - { zh-TW: 大員, en: Tayouan,  from: 1600, to: 1662 }
    - { zh-TW: 安平, en: Anping,   from: 1662 }
  modern: { zh-TW: 臺南市安平區, en: Anping, Tainan }
```

The UI shows the **period-appropriate name**, with the modern name in a tooltip.

### 5.3 Handling years ("B.C. 0")
- The historical calendar **has no year 0**: 1 BC is followed directly by AD 1. Internally we use **astronomical year numbering** (1 BC = `0`, 2 BC = `-1`, …), which makes the arithmetic correct.
- The slider's lower bound is **30,000 BC** (astronomical `-29999`), which covers Taiwan's Paleolithic Changbin culture. The page opens on 1 BC (astronomical `0`) to 2026.
- **Display formats**, chosen by the user:
  - zh-TW: `西元前1年` / `西元1年`; from 1912 onward, optionally with the Minguo year, e.g. `1949年（民國38年）`
  - en: `1 BC` / `AD 1` (or `BCE`/`CE`)
- Each event stores `precision`, so ancient events with uncertain dates show as "c. 230" or "3rd century" rather than with false accuracy.
- All dates use the **proleptic Gregorian** calendar. Lunar calendar and era-name dates (e.g. 永曆十五年) can be shown as an extra label in Phase 2.

### 5.4 Categories
`politics` · `war` · `dynasty` (founding or fall) · `diplomacy` · `trade` · `migration` · `religion` · `culture` · `science` · `disaster` · `economy` · `exploration`

Each category has an icon and a colour, chosen with colour-blind-safe contrast.

---

## 6. Content strategy

Quality of content matters more than quantity. A **hand-curated core** is the starting point:

| Batch | Region | Target # events | Examples |
|---|---|---|---|
| 1 | **Taiwan** | 80–120 | Austronesian cultures, 1624 Dutch at Tayouan, 1626 Spanish at Keelung, 1661 Koxinga, 1683 Qing annexation, 1721 Zhu Yigui uprising, 1786 Lin Shuangwen, 1874 Mudan Incident, 1884 Sino-French War (Keelung/Tamsui), 1895 Treaty of Shimonoseki & Republic of Formosa, 1930 Wushe Incident, 1945 retrocession, 1947 228 Incident, 1949 martial law, 1979 Kaohsiung Incident, 1987 end of martial law, 1996 first direct presidential election, … |
| 2 | **China** | 150–200 | Han dynasty, Three Kingdoms, Sui–Tang, An Lushan Rebellion, Song, Mongol conquest, Zheng He voyages, Ming–Qing transition, Opium Wars, 1911 Xinhai Revolution, … |
| 3 | **Japan & Korea** | 100–150 | Yamato, Nara/Heian, Mongol invasions, Imjin War, Tokugawa, Meiji Restoration, Korean kingdoms, … |
| 4 | **Southeast Asia, South Asia, Central Asia** | 100–150 | Srivijaya, Angkor, Majapahit, Spanish Manila 1571, Mughals, Silk Road, … |
| 5 | **World context** | 50 | Roman Empire, Islam, Columbus, WWI/WWII, Cold War, … |

**Scaling up (Phase 2).** A script, `scripts/import-wikidata.ts`, queries **Wikidata SPARQL** for events with a point in time (P585) or start/end (P580/P582), coordinates (P625) or location (P276), and an Asia region filter. It writes **draft YAML** for a person to review. Nothing is auto-published. This way we get scale without losing editorial control.

**Editorial principles**
- **Neutral, sourced wording.** Every event has at least one source.
- **Multiple perspectives** on contested events. Event titles use widely accepted neutral names, and alternative names are listed.
- **Taiwan-centred, not Taiwan-only.** Taiwan's own history is covered first-class, not as a footnote to other narratives.

---

## 7. Licensing & attribution
- **Code:** MIT (proposed).
- **Curated data:** CC BY-SA 4.0 (compatible with Wikipedia-derived summaries).
- **Map tiles:** OpenStreetMap contributors (ODbL), OpenFreeMap, AWS Terrain Tiles (Mapzen, various sources), EOX Sentinel-2 Cloudless (CC BY-NC-SA, non-commercial only; switch to Esri or MapTiler if the project becomes commercial). Attribution is shown in the map footer.
- **Historical borders (Phase 3):** *historical-basemaps* (aourednik) is GPL-3.0. Its license must be confirmed as compatible before use. Alternatives are CShapes (1886+) and a hand-made dataset for Taiwan and East Asia.

---

## 8. Non-functional requirements

| Area | Target |
|---|---|
| Performance | First load < 3 s on 4G. Slider drag keeps ≥ 50 fps with 5,000 events |
| Accessibility | Keyboard-operable slider and table, ARIA labels, WCAG AA contrast, and markers that never rely on colour alone (each also has an icon) |
| Responsive | ≥ 360 px wide (bottom-sheet layout) up to 4K |
| Shareability | All state (range, selected event, map view, style, language) is stored in the URL |
| Offline | Optional PWA caching of data (Phase 2) |
| Browser support | Last 2 versions of Chrome, Safari, Firefox, Edge. WebGL2 required |

---

## 9. Roadmap

### Phase 0: Foundation (week 1)
- Vite + React + TS scaffold, lint/format, CI, GitHub Pages deploy
- Data schemas (Zod), build and validate scripts, about 20 seed events

### Phase 1: MVP (weeks 2–5)
- Map centred on Taiwan, zoom/pan, **5 base styles + terrain toggle**, re-centre button
- **Timeline range slider** (non-linear axis, histogram, era presets, year input)
- **Sidebar table** with sorting, category filters, and importance thresholds
- **Event ↔ location linking** (markers, highlight, fly-to, origin→destination arcs)
- Event ↔ event relation chips
- zh-TW + EN, URL state sync
- **Content batches 1–2** (Taiwan + China, about 250 events)

### Phase 2: Depth (weeks 6–9)
- Content batches 3–5, Wikidata import tool
- ▶ Play animation, search, "only in current view" filter
- Period-appropriate place names, lunar/era-name date labels
- Mobile bottom-sheet polish, PWA

### Phase 3: Historical geography
- **Historical borders layer** that changes with the slider (dynasties, colonial territories)
- Historical trade routes (Maritime Silk Road, galleon trade)
- Deeper prehistory content (the timeline already reaches 30,000 BC)

### Phase 4: Global & community
- Full world coverage, contributions via PRs and a data guide, possibly a lightweight CMS

---

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Modern borders make past events misleading | "Historical (muted)" style and a toggle to hide modern borders. Phase 3 adds period borders |
| Politically sensitive naming (e.g. Taiwan's status, disputed regions) | Neutral editorial guidelines, alternative names, source citations, and a clear "About" page |
| Too many events for long ranges | Importance threshold that adapts to range width, plus clustering |
| Free tile providers change terms or go down | Styles live in config, so switching providers is a config change. The fallback is self-hosted PMTiles on Cloudflare R2 |
| Uncertain ancient dates | `precision` + `approximate` fields shown honestly in the UI |
| Content creation is slow | Start with Taiwan, then use Wikidata drafts plus human curation |

---

## 11. Decisions (2026-10-16)

| # | Question | Decision |
|---|---|---|
| 1 | App name | **回望 Look Back** for now; may change later. |
| 2 | Default language | **Traditional Chinese (zh-TW)**, with an English toggle. |
| 3 | Start year | **Allow earlier prehistory.** The timeline starts at 30,000 BC (Changbin culture) and opens on 1 BC – 2026. |
| 4 | Hosting | **GitHub Pages** at `tiong-ui.github.io/look-back`. |
| 5 | Satellite imagery | **Non-commercial project**, so EOX Sentinel-2 Cloudless is used. |
| 6 | Content | **Claude drafts most event text**; the owners review. Summaries are written from the **Taiwan-centred view (臺灣主體觀點)**. Contested events list every main viewpoint (ROC official, PRC official, Indigenous, scholarly…) side by side. See [EDITORIAL.md](EDITORIAL.md). |
| 7 | Importance | **Derived from Wikipedia**: the number of language editions (Wikidata) plus 12 months of English and Chinese page views, with a +1 boost for Taiwan events. Refreshed monthly by a GitHub Action. See [DATA.md](DATA.md#importance重要度). |
| – | Resource links | A **resource-links list** lives in `data/resources.yaml`. It can be edited at any time and is shown in the app under 參考資源 / Resources. |

## 12. Progress & next steps

**Done (Phase 0 and most of Phase 1):**
- App scaffold, CI, GitHub Pages deploy, monthly importance refresh
- Data schema with validation; 82 seed events (50 Taiwan, 32 Asia/world context), 75 places, 21 eras, 20 resources
- Map centred on Taiwan with six styles, 3D terrain, globe view, border and label toggles
- Timeline with non-linear axis, histogram, era presets, typed year input (incl. 西元前 / 民國), play
- Event list with importance thresholds, category, place and map-view filters
- Event ↔ place linking (highlights, fly-to, origin → destination arcs) and event ↔ event relation links
- Period-appropriate place names, perspectives on contested events, resource links

**Next:**
1. Turn on GitHub Pages and run the importance workflow once (see README).
2. Review the drafted event text; expand content batches 1–2 toward ~250 events.
3. Search, PWA (Phase 2).

**Wikidata import (added):** `npm run import` / the *Import events from Wikidata* workflow pulls notable events in Asia (and every event in Taiwan with 2+ language editions) from Wikidata. They are shown like any other event; an editor can move one into `data/events/` to write a fuller summary.

