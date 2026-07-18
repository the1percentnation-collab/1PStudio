import React from 'react';
import { colors as c, fonts as f } from '../theme';

// 1P monogram lockup (matches the1pnation.com brand mark).
function Logo({ compact = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: '#000', border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: f.display, fontSize: 18, color: '#fff', letterSpacing: '-0.02em', flexShrink: 0 }}>
        1P
      </div>
      {!compact && (
        <div style={{ lineHeight: 1 }}>
          <div style={{ fontFamily: f.mono, fontSize: 8.5, letterSpacing: '0.2em', color: c.textDim }}>THE ONE PERCENT</div>
          <div style={{ fontFamily: f.display, fontSize: 20, letterSpacing: '0.02em', color: '#fff', marginTop: 3 }}>
            STUDIO
          </div>
        </div>
      )}
    </div>
  );
}

const ICONS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  composer: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </>
  ),
  clips: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 8h20" />
      <path d="M6 4v4" />
      <path d="M10 4v4" />
      <path d="M14 4v4" />
      <path d="M18 4v4" />
      <path d="m10 12 5 3-5 3z" />
    </>
  ),
  captions: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <line x1="7" y1="11" x2="11" y2="11" />
      <line x1="14" y1="11" x2="17" y2="11" />
      <line x1="7" y1="15" x2="15" y2="15" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  posts: (
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="3.5" cy="6" r="1" />
      <circle cx="3.5" cy="12" r="1" />
      <circle cx="3.5" cy="18" r="1" />
    </>
  ),
  analytics: (
    <>
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="18" y1="20" x2="18" y2="10" />
    </>
  ),
  library: (
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </>
  ),
  accounts: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
};

function Icon({ name }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name]}
    </svg>
  );
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'composer', label: 'Composer', icon: 'composer' },
  { id: 'clips', label: 'Clips', icon: 'clips' },
  { id: 'captions', label: 'Captions', icon: 'captions' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'posts', label: 'Posts', icon: 'posts' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics' },
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'accounts', label: 'Accounts', icon: 'accounts' },
];

export default function Sidebar({ active, onNavigate, counts = {}, isMobile = false }) {
  const activeRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  // Which directions the mobile tab bar can still scroll toward.
  const [edges, setEdges] = React.useState({ start: false, end: false });

  const updateEdges = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setEdges({
      start: el.scrollLeft > 2,
      end: el.scrollLeft < maxScroll - 2,
    });
  }, []);

  // Keep the selected tab visible, and recompute the scroll affordances.
  React.useEffect(() => {
    if (isMobile && activeRef.current) {
      activeRef.current.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [active, isMobile]);

  React.useEffect(() => {
    if (!isMobile) return undefined;
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, [isMobile, updateEdges]);

  const nudge = React.useCallback((dir) => {
    scrollRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
  }, []);

  if (isMobile) {
    const arrowBase = {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: 40,
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      color: '#E63329',
      fontSize: 26,
      lineHeight: 1,
      paddingBottom: 4,
      zIndex: 3,
    };
    return (
      <nav
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(12,12,12,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: `1px solid ${c.border}`,
          zIndex: 200,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* hide the horizontal scrollbar without losing scrollability */}
        <style>{'.p1-tabbar::-webkit-scrollbar{display:none}'}</style>
        <div style={{ position: 'relative' }}>
          <div
            ref={scrollRef}
            className="p1-tabbar"
            onScroll={updateEdges}
            style={{
              display: 'flex',
              gap: 6,
              padding: '9px 10px',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {NAV.map(({ id, label, icon }) => {
              const isActive = active === id;
              const count = counts[id];
              return (
                <button
                  key={id}
                  ref={isActive ? activeRef : undefined}
                  onClick={() => onNavigate(id)}
                  aria-current={isActive ? 'page' : undefined}
                  style={{
                    flex: '0 0 auto',
                    minWidth: 62,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    padding: '7px 12px',
                    borderRadius: 14,
                    background: isActive ? c.redGlow : 'transparent',
                    border: `1px solid ${isActive ? 'rgba(230,51,41,0.28)' : 'transparent'}`,
                    color: isActive ? '#E63329' : '#8A8A8A',
                    fontFamily: f.body,
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                  }}
                >
                  <span style={{ position: 'relative', display: 'flex' }}>
                    <Icon name={icon} />
                    {count > 0 && (
                      <span
                        style={{
                          position: 'absolute',
                          top: -6,
                          right: -9,
                          minWidth: 15,
                          height: 15,
                          padding: '0 4px',
                          borderRadius: 8,
                          background: c.red,
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 700,
                          fontFamily: f.mono,
                          lineHeight: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 0 0 2px rgba(12,12,12,0.9)',
                        }}
                      >
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>

          {/* scroll affordances — fade + tappable chevron on each scrollable side */}
          {edges.start && (
            <button
              onClick={() => nudge(-1)}
              aria-label="Scroll tabs left"
              style={{
                ...arrowBase,
                left: 0,
                justifyContent: 'flex-start',
                paddingLeft: 6,
                background: 'linear-gradient(to right, rgba(12,12,12,0.97) 45%, rgba(12,12,12,0))',
              }}
            >
              ‹
            </button>
          )}
          {edges.end && (
            <button
              onClick={() => nudge(1)}
              aria-label="Scroll tabs right"
              style={{
                ...arrowBase,
                right: 0,
                justifyContent: 'flex-end',
                paddingRight: 6,
                background: 'linear-gradient(to left, rgba(12,12,12,0.97) 45%, rgba(12,12,12,0))',
              }}
            >
              ›
            </button>
          )}
        </div>
      </nav>
    );
  }

  return (
    <aside
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: 232,
        background: c.bg2,
        borderRight: `1px solid ${c.border}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 0 16px',
        zIndex: 200,
      }}
    >
      {/* LOGO */}
      <div style={{ height: 72, display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: `1px solid ${c.border}` }}>
        <Logo />
      </div>

      {/* NAV */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '16px 12px', flex: 1 }}>
        {NAV.map(({ id, label, icon }) => {
          const isActive = active === id;
          const count = counts[id];
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 14px',
                borderRadius: 11,
                background: isActive ? c.redGlow : 'transparent',
                border: `1px solid ${isActive ? 'rgba(230,51,41,0.25)' : 'transparent'}`,
                color: isActive ? '#FFFFFF' : c.textDim,
                fontFamily: f.body,
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '0.01em',
                textAlign: 'left',
                position: 'relative',
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.color = '#FFF'; e.currentTarget.style.background = c.surface; } }}
              onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.color = c.textDim; e.currentTarget.style.background = 'transparent'; } }}
            >
              {isActive && (
                <span style={{ position: 'absolute', left: -1, top: 8, bottom: 8, width: 3, background: c.red, borderRadius: 3, boxShadow: `0 0 12px ${c.red}` }} />
              )}
              <span style={{ color: isActive ? c.red : 'inherit', display: 'flex' }}>
                <Icon name={icon} />
              </span>
              <span style={{ flex: 1 }}>{label}</span>
              {count > 0 && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: f.mono,
                  color: isActive ? c.red : c.textFaint,
                  background: isActive ? 'rgba(230,51,41,0.15)' : c.surface,
                  borderRadius: 10,
                  padding: '1px 8px',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* FOOTER */}
      <div style={{ padding: '0 20px', fontFamily: f.mono, fontSize: 9.5, letterSpacing: '0.14em', color: c.textGhost, lineHeight: 1.7, textTransform: 'uppercase' }}>
        The One Percent Nation<br />Content Studio
      </div>
    </aside>
  );
}
