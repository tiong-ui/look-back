import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { loc, t } from '../i18n';
import { histogram } from '../lib/query';
import { TICKS, TIMELINE_MAX, TIMELINE_MIN, formatTick, formatYear, parseYear, posToYear, yearToPos } from '../lib/time';
import { useStore } from '../store';

const BUCKETS = 120;

type Drag = { kind: 'from' | 'to' } | { kind: 'window'; startX: number; fromPos: number; toPos: number };

export function Timeline() {
  const { atlas, from, to, lang, minguo, setRange, set } = useStore();
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [group, setGroup] = useState('taiwan');
  const [playing, setPlaying] = useState(false);
  const [width, setWidth] = useState(1000);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Drop ticks that would collide with the previous label.
  const ticks = useMemo(() => {
    const minGap = lang === 'zh-TW' ? 40 : 48;
    const out: number[] = [];
    for (const y of TICKS) {
      const x = yearToPos(y) * width;
      if (!out.length || x - yearToPos(out[out.length - 1]) * width >= minGap) out.push(y);
    }
    return out;
  }, [width, lang]);

  const fromPos = yearToPos(from);
  const toPos = yearToPos(to);

  const bars = useMemo(() => {
    const counts = histogram(atlas?.events ?? [], BUCKETS, yearToPos);
    const max = Math.max(1, ...counts);
    return counts.map((c) => c / max);
  }, [atlas]);

  const posFromClient = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return (clientX - r.left) / r.width;
  };

  const onPointerDown = (kind: Drag['kind']) => (ev: PointerEvent) => {
    ev.stopPropagation();
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    drag.current = kind === 'window' ? { kind, startX: ev.clientX, fromPos, toPos } : { kind };
    setPlaying(false);
  };

  const onPointerMove = (ev: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'window') {
      const r = track.current!.getBoundingClientRect();
      let delta = (ev.clientX - d.startX) / r.width;
      delta = Math.max(-d.fromPos, Math.min(1 - d.toPos, delta));
      setRange(posToYear(d.fromPos + delta), posToYear(d.toPos + delta));
    } else {
      const y = posToYear(posFromClient(ev.clientX));
      if (d.kind === 'from') setRange(Math.min(y, to), to);
      else setRange(from, Math.max(y, from));
    }
  };

  const onPointerUp = () => (drag.current = null);

  // Clicking the bare track moves the nearer handle there.
  const onTrackDown = (ev: PointerEvent) => {
    const p = posFromClient(ev.clientX);
    const y = posToYear(p);
    if (Math.abs(p - fromPos) < Math.abs(p - toPos)) setRange(Math.min(y, to), to);
    else setRange(from, Math.max(y, from));
  };

  const onKey = (which: 'from' | 'to') => (ev: KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -100, PageUp: 100 }[ev.key];
    let y = which === 'from' ? from : to;
    if (step !== undefined) y += step * (ev.shiftKey ? 10 : 1);
    else if (ev.key === 'Home') y = TIMELINE_MIN;
    else if (ev.key === 'End') y = TIMELINE_MAX;
    else return;
    ev.preventDefault();
    if (which === 'from') setRange(Math.min(y, to), to);
    else setRange(from, Math.max(y, from));
  };

  // ▶ Play: slide the current window forward at a steady visual speed.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const s = useStore.getState();
      const a = yearToPos(s.from);
      const b = yearToPos(s.to);
      const step = 0.0025;
      if (b + step >= 1) {
        s.setRange(posToYear(1 - (b - a)), TIMELINE_MAX);
        setPlaying(false);
        return;
      }
      s.setRange(posToYear(a + step), posToYear(b + step));
    }, 80);
    return () => window.clearInterval(id);
  }, [playing]);

  const eras = atlas?.eras.filter((e) => e.group === group) ?? [];
  const fmt = (y: number) => formatYear(y, { lang, minguo });

  return (
    <section className="timeline" aria-label={lang === 'zh-TW' ? '時間軸' : 'Timeline'}>
      <div className="tl-controls">
        <button type="button" className="btn play" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
          {playing ? '❚❚' : '▶'} <span className="hide-sm">{t(playing ? 'pause' : 'play', lang)}</span>
        </button>
        <YearInput label={t('from', lang)} value={from} onChange={(y) => setRange(Math.min(y, to), to)} />
        <span className="dash">–</span>
        <YearInput label={t('to', lang)} value={to} onChange={(y) => setRange(from, Math.max(y, from))} />
        <span className="range-label" aria-live="polite">
          {fmt(from)} – {fmt(to)}
        </span>
        <div className="eras">
          <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label={t('eras', lang)}>
            {Object.entries(atlas?.eraGroups ?? {}).map(([id, name]) => (
              <option key={id} value={id}>{loc(name, lang)}</option>
            ))}
          </select>
          <div className="era-chips">
            <button type="button" className="chip" onClick={() => setRange(0, TIMELINE_MAX)}>
              {lang === 'zh-TW' ? '西元元年至今' : '1 BC – now'}
            </button>
            {eras.map((e) => (
              <button
                type="button"
                key={e.id}
                className={`chip ${from === e.from && to === e.to ? 'active' : ''}`}
                onClick={() => setRange(e.from, e.to)}
                title={`${fmt(e.from)} – ${fmt(e.to)}`}
              >
                {loc(e.name, lang)}
              </button>
            ))}
            <button type="button" className="chip" onClick={() => setRange(TIMELINE_MIN, TIMELINE_MAX)}>
              {lang === 'zh-TW' ? '全部' : 'All'}
            </button>
          </div>
        </div>
        <label className="check hide-sm">
          <input type="checkbox" checked={minguo} onChange={(e) => set({ minguo: e.target.checked })} /> {t('minguo', lang)}
        </label>
      </div>

      <div className="tl-track" ref={track} onPointerDown={onTrackDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <svg className="tl-hist" viewBox={`0 0 ${BUCKETS} 1`} preserveAspectRatio="none" aria-hidden="true">
          {bars.map((h, i) => (
            <rect key={i} x={i + 0.1} width={0.8} y={1 - h} height={h} className={(i + 0.5) / BUCKETS >= fromPos && (i + 0.5) / BUCKETS <= toPos ? 'in' : ''} />
          ))}
        </svg>
        <div className="tl-rail" />
        <div
          className="tl-window"
          style={{ left: `${fromPos * 100}%`, width: `${(toPos - fromPos) * 100}%` }}
          onPointerDown={onPointerDown('window')}
        />
        {(['from', 'to'] as const).map((which) => {
          const y = which === 'from' ? from : to;
          return (
            <div
              key={which}
              className={`tl-handle ${which}`}
              style={{ left: `${yearToPos(y) * 100}%` }}
              role="slider"
              tabIndex={0}
              aria-label={t(which, lang)}
              aria-valuemin={TIMELINE_MIN}
              aria-valuemax={TIMELINE_MAX}
              aria-valuenow={y}
              aria-valuetext={fmt(y)}
              onPointerDown={onPointerDown(which)}
              onKeyDown={onKey(which)}
            />
          );
        })}
        <div className="tl-ticks" aria-hidden="true">
          {ticks.map((y) => (
            <span key={y} style={{ left: `${yearToPos(y) * 100}%` }}>{formatTick(y, lang)}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function YearInput({ label, value, onChange }: { label: string; value: number; onChange: (y: number) => void }) {
  const lang = useStore((s) => s.lang);
  const shown = formatYear(value, { lang }).replace(/年$/, '');
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const commit = () => {
    if (draft === null) return;
    const y = parseYear(draft);
    if (y === null) {
      setBad(true);
      return;
    }
    onChange(Math.max(TIMELINE_MIN, Math.min(TIMELINE_MAX, y)));
    setDraft(null);
    setBad(false);
  };
  return (
    <input
      className={`year-input ${bad ? 'bad' : ''}`}
      aria-label={label}
      title={lang === 'zh-TW' ? '例：1661、西元前200、民國50' : 'e.g. 1661, 200 BC, 民國50'}
      value={draft ?? shown}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setDraft(e.target.value);
        setBad(false);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setDraft(null);
          setBad(false);
        }
      }}
    />
  );
}
