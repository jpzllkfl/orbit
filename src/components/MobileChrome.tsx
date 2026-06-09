import type { RefObject } from 'react';
import type { OrbitNode } from '../types/orbit';
import { Icons, LIB_ICON } from './icons';

const I = Icons;

type ViewId = 'grid' | 'connections' | 'settings' | 'atlas' | 'map' | 'smart';

export function MobileChrome({
  drawerOpen,
  toggleDrawer,
  mobSearchOpen,
  setMobSearchOpen,
  query,
  setQuery,
  searchRef,
  atRoot,
  view,
  crumbs,
  libraryReady,
  libs,
  activeLibId,
  isLibrary,
  pickLib,
  goHome,
  pickView,
  openSettings,
}: {
  drawerOpen: boolean;
  toggleDrawer: () => void;
  mobSearchOpen: boolean;
  setMobSearchOpen: (fn: (o: boolean) => boolean) => void;
  query: string;
  setQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  atRoot: boolean;
  view: ViewId;
  crumbs: OrbitNode[];
  libraryReady: boolean;
  libs: OrbitNode[];
  activeLibId: string | null;
  isLibrary: boolean;
  pickLib: (lb: OrbitNode) => void;
  goHome: () => void;
  pickView: (v: ViewId) => void;
  openSettings: () => void;
}) {
  const libIcon = (key?: string) => {
    const name = (LIB_ICON[key || ''] || 'film') as keyof typeof Icons;
    return I[name]({});
  };

  const showLibStrip =
    view === 'grid' && !query.trim() && libraryReady && libs.length > 0 && (atRoot || isLibrary);

  return (
    <>
      {drawerOpen && <div className="drawer-scrim" onClick={() => toggleDrawer()} aria-hidden />}

      <header className="mob-header">
        <button type="button" className="mob-header-btn" onClick={toggleDrawer} aria-label="Open menu">
          {I.menu({})}
        </button>
        <div className="mob-header-title disp">
          {atRoot && view === 'grid' && !query.trim()
            ? 'Orbit'
            : view === 'settings'
              ? 'Settings'
              : view === 'connections'
                ? 'Connections'
                : crumbs[crumbs.length - 1]?.title || 'Orbit'}
        </div>
        <button
          type="button"
          className={'mob-header-btn' + (mobSearchOpen ? ' on' : '')}
          onClick={() => {
            setMobSearchOpen((o) => !o);
            window.setTimeout(() => searchRef.current?.focus(), 50);
          }}
          aria-label="Search"
        >
          {I.search({})}
        </button>
      </header>

      {mobSearchOpen && (
        <div className="mob-searchbar">
          <div className="search mob-search">
            {I.search({})}
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles…"
            />
            {query && (
              <button type="button" className="mob-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                {I.x({})}
              </button>
            )}
          </div>
        </div>
      )}

      {showLibStrip && (
        <div className="mob-lib-strip" role="navigation" aria-label="Libraries">
          {libs.map((lb) => (
            <button
              key={lb.id}
              type="button"
              className={'mob-lib-pill' + (activeLibId === lb.id ? ' on' : '')}
              onClick={() => pickLib(lb)}
            >
              {libIcon(lb.libKey)}
              <span>{lb.title}</span>
            </button>
          ))}
        </div>
      )}

      <nav className="mob-nav" aria-label="Main navigation">
        <button type="button" className={atRoot && view === 'grid' && !query.trim() ? 'on' : ''} onClick={goHome}>
          {I.home({})}
          <span>Home</span>
        </button>
        <button
          type="button"
          className={mobSearchOpen ? 'on' : ''}
          onClick={() => {
            if (drawerOpen) toggleDrawer();
            setMobSearchOpen((o) => !o);
            window.setTimeout(() => searchRef.current?.focus(), 50);
          }}
        >
          {I.search({})}
          <span>Search</span>
        </button>
        <button
          type="button"
          className={drawerOpen || !!activeLibId || (isLibrary && view === 'grid' && !query.trim()) ? 'on' : ''}
          onClick={toggleDrawer}
        >
          {I.lib({})}
          <span>Menu</span>
        </button>
        <button type="button" className={view === 'atlas' ? 'on' : ''} onClick={() => pickView('atlas')}>
          {I.tree({})}
          <span>Atlas</span>
        </button>
        <button type="button" className={view === 'settings' ? 'on' : ''} onClick={openSettings}>
          {I.gear({})}
          <span>Settings</span>
        </button>
      </nav>
    </>
  );
}
