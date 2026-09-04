import React from 'react';

export type SpectralStateKind = 'empty' | 'loading' | 'error' | 'offline';
export type SpectralStateType = 'generic' | 'orders' | 'accounts' | 'products' | 'keywords' | 'conversation' | 'model' | 'chart';

interface SpectralStateProps {
  state: SpectralStateKind;
  type?: SpectralStateType;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

const stateColors: Record<SpectralStateKind, string> = {
  empty: 'var(--accent-bright)',
  loading: 'var(--accent)',
  error: 'var(--status-danger)',
  offline: 'var(--text-muted)',
};

const StateGlyph: React.FC<{ state: SpectralStateKind; type: SpectralStateType }> = ({ state, type }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    className="h-14 w-14"
    style={{ color: stateColors[state] }}
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g className="spectral-state__orbit">
      <path d="M18 48A23 23 0 0 1 13 23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M46 16a23 23 0 0 1 5 25" stroke="currentColor" strokeOpacity="0.48" strokeWidth="2" strokeLinecap="round" />
      <circle cx="49" cy="47" r="2.5" fill="currentColor" />
    </g>
    <path d="M32 20 44 32 32 44 20 32 32 20Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M32 26 38 32 32 38 26 32 32 26Z" fill="currentColor" />

    {type === 'orders' && <path d="M25 50h14" stroke="currentColor" strokeOpacity="0.58" strokeWidth="1.5" strokeLinecap="round" />}
    {type === 'accounts' && <path d="M25 15h14" stroke="currentColor" strokeOpacity="0.58" strokeWidth="1.5" strokeLinecap="round" />}
    {type === 'products' && <path d="M48 27v10" stroke="currentColor" strokeOpacity="0.58" strokeWidth="1.5" strokeLinecap="round" />}
    {type === 'keywords' && <path d="M16 28v8" stroke="currentColor" strokeOpacity="0.58" strokeWidth="1.5" strokeLinecap="round" />}
    {type === 'conversation' && <><circle cx="27" cy="51" r="1.5" fill="currentColor" /><circle cx="35" cy="51" r="1.5" fill="currentColor" /></>}
    {type === 'chart' && <path d="m23 50 6-5 5 2 7-7" stroke="currentColor" strokeOpacity="0.58" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    {type === 'model' && <circle cx="32" cy="13" r="1.7" fill="currentColor" />}
  </svg>
);

const SpectralState: React.FC<SpectralStateProps> = ({
  state,
  type = 'generic',
  title,
  description,
  actions,
  compact = false,
  className = '',
}) => (
  <div
    role={state === 'error' ? 'alert' : 'status'}
    aria-live={state === 'loading' ? 'polite' : undefined}
    aria-busy={state === 'loading' || undefined}
    data-state={state}
    data-type={type}
    className={`spectral-state mx-auto flex max-w-md flex-col items-center justify-center text-center ${compact ? 'px-5 py-12' : 'px-6 py-16'} ${className}`}
  >
    <StateGlyph state={state} type={type} />
    <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
    {description && <p className="mt-1.5 max-w-sm text-sm leading-6 text-[var(--text-secondary)]">{description}</p>}
    {actions && <div className="mt-5">{actions}</div>}
  </div>
);

export default SpectralState;
