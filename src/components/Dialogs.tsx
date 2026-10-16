import { useEffect, useRef } from 'react';
import { loc, t } from '../i18n';
import { useStore } from '../store';

function Dialog({ title, children }: { title: string; children: React.ReactNode }) {
  const { lang, set } = useStore();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="dialog" onClose={() => set({ dialog: null })} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="dialog-inner">
        <header>
          <h2>{title}</h2>
          <button type="button" className="btn" onClick={() => ref.current?.close()} aria-label={t('close', lang)}>✕</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function ResourcesDialog() {
  const { atlas, lang } = useStore();
  if (!atlas) return null;
  const groups = Object.entries(atlas.resourceTypes)
    .map(([type, name]) => ({ type, name, items: atlas.resources.filter((r) => r.type === type) }))
    .filter((g) => g.items.length);
  return (
    <Dialog title={`📚 ${t('resources', lang)}`}>
      <p className="muted">
        {lang === 'zh-TW'
          ? '本專案參考的資料來源。清單維護於 data/resources.yaml，可隨時新增或修改。'
          : 'Sources used by this project. The list lives in data/resources.yaml and can be edited at any time.'}
      </p>
      {groups.map((g) => (
        <section key={g.type} className="res-group">
          <h3>{loc(g.name, lang)}</h3>
          <ul>
            {g.items.map((r) => (
              <li key={r.id}>
                {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{loc(r.name, lang)}</a> : <b>{loc(r.name, lang)}</b>}
                {r.description && <div className="muted small">{loc(r.description, lang)}</div>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Dialog>
  );
}

export function AboutDialog() {
  const { lang } = useStore();
  return (
    <Dialog title={`${t('appName', lang)} · ${t('about', lang)}`}>
      {lang === 'zh-TW' ? (
        <>
          <p>「回望」是一個以臺灣為中心的歷史地圖。拖曳下方時間軸選擇年代範圍，右側會列出該時期的重大事件；點選事件即可在地圖上看到相關地點、移動路線與相關事件。</p>
          <h3>編輯立場</h3>
          <p>本站以<b>臺灣主體觀點</b>書寫事件摘要。對於有爭議的事件，我們同時列出中華民國官方、中華人民共和國官方、原住民族與學界等不同觀點，並附上資料來源，讓讀者自行判斷。</p>
          <h3>重要度</h3>
          <p>事件的重要度（1–5）以維基百科的語言版本數與瀏覽量計算，並對臺灣相關事件加權，以免被全球知名事件淹沒。時間範圍愈寬，只顯示愈重大的事件；可勾選「顯示全部」查看所有事件。</p>
          <h3>年代</h3>
          <p>歷史紀年沒有西元0年：西元前1年之後就是西元1年。時間軸可往前延伸至約三萬年前的舊石器時代。</p>
          <p className="muted small">程式碼與資料：<a href="https://github.com/tiong-ui/look-back" target="_blank" rel="noreferrer">github.com/tiong-ui/look-back</a></p>
        </>
      ) : (
        <>
          <p>Look Back is a history map centred on Taiwan. Drag the timeline to pick a range of years; the panel lists the major events of that period. Select an event to see its places, movements and related events on the map.</p>
          <h3>Editorial stance</h3>
          <p>Event summaries are written from a <b>Taiwan-centred perspective</b>. For contested events we also list the ROC official, PRC official, Indigenous and scholarly views, with sources, so readers can judge for themselves.</p>
          <h3>Importance</h3>
          <p>Importance (1–5) is computed from the number of Wikipedia language editions and page views, with a boost for Taiwan-related events so they are not drowned out by globally famous ones. Wider ranges show only the most important events; tick "Show all" to see everything.</p>
          <h3>Years</h3>
          <p>The historical calendar has no year 0: 1 BC is followed by AD 1. The timeline reaches back about 30,000 years to the Paleolithic.</p>
          <p className="muted small">Code &amp; data: <a href="https://github.com/tiong-ui/look-back" target="_blank" rel="noreferrer">github.com/tiong-ui/look-back</a></p>
        </>
      )}
    </Dialog>
  );
}
