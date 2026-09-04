import React from 'react';

export type SystemStatusState = 'healthy' | 'warning' | 'error' | 'loading';

interface SystemStatusInput {
  loading: boolean;
  error: boolean;
  accountCount?: number;
}

interface SystemStatusProps {
  status: SystemStatusState;
  accountCount?: number;
  className?: string;
}

const statusMeta: Record<SystemStatusState, { label: string; color: string }> = {
  healthy: { label: '系统运行正常', color: 'var(--status-success)' },
  warning: { label: '尚未接入账号', color: 'var(--status-warning)' },
  error: { label: '系统异常', color: 'var(--status-danger)' },
  loading: { label: '数据准备中', color: 'var(--accent)' },
};

export const deriveSystemStatus = ({ loading, error, accountCount }: SystemStatusInput): SystemStatusState => {
  if (error) return 'error';
  if (loading) return 'loading';
  if (accountCount === 0) return 'warning';
  return 'healthy';
};

const SystemStatus: React.FC<SystemStatusProps> = ({ status, accountCount, className = '' }) => {
  const meta = statusMeta[status];

  return (
    <div
      role="status"
      aria-live="polite"
      data-state={status}
      className={`system-status min-w-[150px] rounded-[11px] border border-[var(--border-subtle)] bg-[var(--surface-primary)] px-3.5 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.14)] ${className}`}
    >
      <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">System Status</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden="true" />
        <span className="text-xs font-semibold text-[var(--text-secondary)]">{meta.label}</span>
        {typeof accountCount === 'number' && status === 'healthy' && (
          <span className="ml-auto text-[10px] tabular-nums text-[var(--text-muted)]">{accountCount} 个账号</span>
        )}
      </div>
    </div>
  );
};

export default SystemStatus;
