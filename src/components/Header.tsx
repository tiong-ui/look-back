import { useEffect, useRef, useState } from 'react';
import { loc, t } from '../i18n';
import { STYLES, styleDef } from '../map/styles';
import { useStore } from '../store';

export function Header() {
  const { lang, set } = useStore();
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden="true">回</span>
        <div>
          <h1>{t('appName', lang)} <span className="en">{lang === 'zh-TW' ? 'Look Back' : '回望'}</span></h1>
          <p className="tagline hide-sm">{t('tagline', lang)}</p>
        </div>
      </div>
      <div className="top-actions">
        <button type="button" className="btn" onClick={() => set({ recenterTick: useStore.getState().recenterTick + 1 })} title={t('recenter', lang)}>
          ⌖ <span className="hide-sm">{t('recenter', lang)}</span>
        </button>
        <StyleMenu />
        <button type="button" className="btn" onClick={() => set({ dialog: 'resources' })}>
          📚 <span className="hide-sm">{t('resources', lang)}</span>
        </button>
        <button type="button" className="btn" onClick={() => set({ dialog: 'about' })} aria-label={t('about', lang)}>ⓘ</button>
        <div className="lang-toggle" role="group" aria-label="Language">
          <button type="button" aria-pressed={lang === 'zh-TW'} onClick={() => set({ lang: 'zh-TW' })}>中文</button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => set({ lang: 'en' })}>EN</button>
        </div>
      </div>
    </header>
  );
}

function StyleMenu() {
  const { lang, style, terrain, globe, borders, labels, set } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const vector = styleDef(style).vector;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="style-menu" ref={ref}>
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        🗺️ <span className="hide-sm">{loc(styleDef(style).name, lang)}</span> ▾
      </button>
      {open && (
        <div className="menu" role="dialog" aria-label={t('mapStyle', lang)}>
          <h3>{t('mapStyle', lang)}</h3>
          <div className="style-grid">
            {STYLES.map((s) => (
              <button type="button" key={s.id} className={`style-tile ${s.id === style ? 'active' : ''}`} aria-pressed={s.id === style} onClick={() => set({ style: s.id })}>
                <span className="swatch" style={{ background: s.swatch }} />
                {loc(s.name, lang)}
              </button>
            ))}
          </div>
          <h3>{t('layers', lang)}</h3>
          <label className="check"><input type="checkbox" checked={terrain} onChange={(e) => set({ terrain: e.target.checked })} /> ⛰️ {t('terrain', lang)}</label>
          <label className="check"><input type="checkbox" checked={globe} onChange={(e) => set({ globe: e.target.checked })} /> 🌏 {t('globe', lang)}</label>
          <label className={`check ${vector ? '' : 'disabled'}`} title={vector ? '' : t('vectorOnly', lang)}>
            <input type="checkbox" checked={borders} disabled={!vector} onChange={(e) => set({ borders: e.target.checked })} /> {t('borders', lang)}
          </label>
          <label className={`check ${vector ? '' : 'disabled'}`} title={vector ? '' : t('vectorOnly', lang)}>
            <input type="checkbox" checked={labels} disabled={!vector} onChange={(e) => set({ labels: e.target.checked })} /> {t('labels', lang)}
          </label>
          {!vector && <p className="hint">{t('vectorOnly', lang)}</p>}
        </div>
      )}
    </div>
  );
}
