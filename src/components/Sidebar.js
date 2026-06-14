import React from 'react';

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
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
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
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics' },
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'accounts', label: 'Accounts', icon: 'accounts' },
];

export default function Sidebar({ active, onNavigate, counts = {}, isMobile = false }) {
  if (isMobile) {
    return (
      <nav
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          height: 64,
          background: 'rgba(13,13,13,0.96)',
          backdropFilter: 'blur(8px)',
          borderTop: '1px solid #1A1A1A',
          display: 'flex',
          zIndex: 200,
        }}
      >
        {NAV.map(({ id, label, icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                background: 'transparent',
                color: isActive ? '#E60306' : '#777',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.02em',
              }}
            >
              <Icon name={icon} />
              {label}
            </button>
          );
        })}
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
        width: 220,
        background: '#0D0D0D',
        borderRight: '1px solid #1A1A1A',
        display: 'flex',
        flexDirection: 'column',
        padding: '0 0 16px',
        zIndex: 200,
      }}
    >
      {/* LOGO */}
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          padding: '0 22px',
          borderBottom: '1px solid #1A1A1A',
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 26,
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ color: '#E60306' }}>1P</span>
        <span style={{ color: '#FFFFFF', marginLeft: 6 }}>STUDIO</span>
      </div>

      {/* NAV */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '14px 12px', flex: 1 }}>
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
                borderRadius: 10,
                background: isActive ? 'rgba(230,3,6,0.10)' : 'transparent',
                color: isActive ? '#FFFFFF' : '#777',
                fontSize: 14,
                fontWeight: 600,
                letterSpacing: '0.01em',
                textAlign: 'left',
                position: 'relative',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = '#FFF'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = '#777'; }}
            >
              {isActive && (
                <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, background: '#E60306', borderRadius: 3 }} />
              )}
              <span style={{ color: isActive ? '#E60306' : 'inherit', display: 'flex' }}>
                <Icon name={icon} />
              </span>
              <span style={{ flex: 1 }}>{label}</span>
              {count > 0 && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: isActive ? '#E60306' : '#555',
                  background: isActive ? 'rgba(230,3,6,0.15)' : '#1A1A1A',
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
      <div style={{ padding: '0 22px', fontSize: 11, color: '#333', lineHeight: 1.5 }}>
        The One Percent Nation<br />Content Studio
      </div>
    </aside>
  );
}
