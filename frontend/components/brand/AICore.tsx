import React from 'react';

export type AICoreState = 'offline' | 'loading' | 'online' | 'error';

interface AICoreStateInput {
  loading: boolean;
  action: 'load' | 'unload' | null;
  loaded: boolean;
  error: string;
}

interface AICoreProps {
  state: AICoreState;
  size?: number;
  className?: string;
}

const stateLabels: Record<AICoreState, string> = {
  offline: '未加载',
  loading: '加载中',
  online: '已加载',
  error: '错误',
};

const stateColors: Record<AICoreState, string> = {
  offline: 'var(--text-muted)',
  loading: 'var(--accent)',
  online: 'var(--accent-bright)',
  error: 'var(--status-danger)',
};

export const resolveAICoreState = ({ loading, action, loaded, error }: AICoreStateInput): AICoreState => {
  if (error) return 'error';
  if (loading || action !== null) return 'loading';
  return loaded ? 'online' : 'offline';
};

const AICore: React.FC<AICoreProps> = ({ state, size = 48, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    role="img"
    aria-label={`AI Core：${stateLabels[state]}`}
    data-state={state}
    className={`ai-core ${className}`}
    style={{ color: stateColors[state] }}
    xmlns="http://www.w3.org/2000/svg"
  >
    <g className="ai-core__orbit">
      <path d="M10.2 30.1A14.2 14.2 0 0 1 7.1 14.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M29.1 9.1a14.2 14.2 0 0 1 3.4 15.7" stroke="currentColor" strokeOpacity="0.58" strokeWidth="2" strokeLinecap="round" />
      <circle cx="31.8" cy="29.7" r="2" fill="currentColor" />
    </g>
    <g className="ai-core__core">
      <path d="M20 11.7 28.3 20 20 28.3 11.7 20 20 11.7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M20 16 24 20 20 24 16 20 20 16Z" fill="currentColor" />
    </g>
  </svg>
);

export default AICore;
