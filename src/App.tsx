import { useEffect } from 'react';
import { t } from './i18n';
import type { Atlas } from './lib/types';
import { MapView } from './map/MapView';
import { useStore } from './store';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Timeline } from './components/Timeline';
import { AboutDialog, ResourcesDialog } from './components/Dialogs';

export function App() {
  const { atlas, loadError, lang, dialog, set } = useStore();

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/atlas.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Atlas>;
      })
      .then((atlas) => set({ atlas }))
      .catch((err) => set({ loadError: String(err) }));
  }, [set]);

  return (
    <div className="app">
      <MapView />
      <Header />
      {atlas ? <Sidebar /> : <div className="status">{loadError ? `${t('loadError', lang)}: ${loadError}` : t('loading', lang)}</div>}
      <Timeline />
      {dialog === 'resources' && <ResourcesDialog />}
      {dialog === 'about' && <AboutDialog />}
    </div>
  );
}
