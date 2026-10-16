# Editorial guidelines（編輯準則）

## Stance

Look Back is written from a **Taiwan-centred view (臺灣主體觀點)**: Taiwan and the people who live there are the subject of their own history, not a footnote to another country's story. Event summaries use this framing by default.

For **contested events**, the event also lists the other main viewpoints in its `perspectives` field, each labelled, so readers can compare them. Available viewpoints are defined in `data/config.yaml`:

| id | 名稱 | Use for |
|---|---|---|
| `taiwan` | 臺灣主體觀點 | The Taiwan-centred reading (also the default voice of the summary) |
| `roc` | 中華民國官方觀點 | Official ROC positions and textbook framing |
| `prc` | 中華人民共和國官方觀點 | Official PRC positions |
| `japan` | 日本觀點 | Japanese government or mainstream Japanese framing |
| `indigenous` | 原住民族觀點 | Indigenous peoples' perspectives |
| `scholarly` | 學界觀點 | Where academic consensus is unsettled or differs from all of the above |

Rules:

1. **Facts stay facts.** Dates, numbers and who-did-what are stated plainly and must be sourced. Perspective belongs in `perspectives`, not in invented facts.
2. **Describe each view accurately**, in the terms its holders would recognise, even when the summary disagrees with it.
3. **Prefer sources** from the list in `data/resources.yaml`. Add new ones there.
4. **Uncertain dates** use `approximate: true` and a coarse `precision` (`decade`, `century`, `millennium`) instead of false precision.

## Terminology（用語）

| Use（使用） | Instead of（避免） | Note |
|---|---|---|
| 中國 | 大陸、內地 | For the PRC / mainland China |
| 日治時期 | 日據時期 | 日據 is listed as an alternative name |
| 清治時期 | 清領時期 | Either is acceptable; keep it consistent |
| 東寧王國 | 明鄭時期 | 明鄭 is listed as an alternative name |
| 中華民國接管臺灣 | 臺灣光復 | 光復 and 終戰 are listed as alternative names |
| 原住民族 | 山胞、番 | Historical terms appear only in quotes |
| 臺灣 | 台灣 | Either is fine in prose; titles use 臺 |
| Taiwan | Taiwan, Province of China | English |

Years are shown in the Western calendar (西元). Minguo (民國) years can be switched on in the UI for 1912 onwards.

## Language

Every event has Traditional Chinese (`zh-TW`, required) and English (`en`) text. Keep summaries to two or three sentences. Write so a secondary-school student can follow.

## Drafting process

Most event text is drafted by Claude and reviewed by the project owners. When reviewing, check:

- the dates and places against at least one source,
- that contested events have `perspectives`,
- that the wording follows the terminology table above.
