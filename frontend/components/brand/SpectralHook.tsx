import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export const SPECTRAL_ACTIONS = [
  'add-account',
  'sync-orders',
  'import-orders',
  'ship-order',
  'sync-product',
  'add-product',
  'add-card',
  'save-card',
  'add-keyword',
  'save-keyword',
  'save-delivery-rule',
  'save-default-reply',
  'save-settings',
  'save-model-config',
  'load-model',
  'send-ai-message',
] as const;

export type SpectralAction = typeof SPECTRAL_ACTIONS[number];
export type SpectralHookPhase = 'idle' | 'charging' | 'traveling' | 'impact' | 'tension' | 'returning' | 'broken';
export type SpectralHookOutcome = 'pending' | 'success' | 'failure';

type Point = { x: number; y: number };

export interface SpectralHookState {
  id: number;
  phase: SpectralHookPhase;
  outcome: SpectralHookOutcome;
  source: Point;
  target: Point;
  path: string;
  angle: number;
  dimmed: boolean;
}

interface SpectralActionOptions {
  action?: SpectralAction | string;
  immediate?: boolean;
}

interface SpectralHookContextValue {
  state: SpectralHookState | null;
  runSpectralAction: <T>(
    target: HTMLElement,
    operation: () => Promise<T> | T,
    options?: SpectralActionOptions,
  ) => Promise<T>;
}

const SpectralHookContext = createContext<SpectralHookContextValue | null>(null);

export const isSpectralActionAllowed = (action: string): action is SpectralAction =>
  (SPECTRAL_ACTIONS as readonly string[]).includes(action);

export const getSpectralOutcome = (value: unknown): Exclude<SpectralHookOutcome, 'pending'> => {
  if (value instanceof Error) return 'failure';
  if (typeof value === 'object' && value !== null && 'success' in value && value.success === false) return 'failure';
  return 'success';
};

const centerOf = (rect: DOMRect): Point => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

const buildPath = (source: Point, target: Point) => {
  const direction = target.x >= source.x ? 1 : -1;
  const distance = Math.max(80, Math.abs(target.x - source.x));
  const bend = Math.max(-56, Math.min(56, (target.y - source.y) * 0.16));
  const first = { x: source.x + direction * Math.min(210, distance * 0.44), y: source.y - bend };
  const second = { x: target.x - direction * Math.min(150, distance * 0.26), y: target.y - 22 - bend };
  const angle = Math.atan2(target.y - second.y, target.x - second.x) * 180 / Math.PI;
  return {
    path: `M ${source.x.toFixed(1)} ${source.y.toFixed(1)} C ${first.x.toFixed(1)} ${first.y.toFixed(1)}, ${second.x.toFixed(1)} ${second.y.toFixed(1)}, ${target.x.toFixed(1)} ${target.y.toFixed(1)}`,
    angle,
  };
};

export const isViewportVisible = (
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>,
  viewportWidth: number,
  viewportHeight: number,
) => rect.width > 0 && rect.height > 0
  && rect.right > 0 && rect.bottom > 0
  && rect.left < viewportWidth && rect.top < viewportHeight;

const findVisibleSource = (): HTMLElement | null => {
  if (typeof document === 'undefined') return null;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-spectral-source="true"]'));
  return candidates.find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return isViewportVisible(rect, window.innerWidth, window.innerHeight)
      && style.display !== 'none' && style.visibility !== 'hidden';
  }) ?? null;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const SpectralHookProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SpectralHookState | null>(null);
  const effectId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current = [];
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    const cancel = () => {
      clearTimers();
      effectId.current += 1;
      setState(null);
    };
    window.addEventListener('resize', cancel);
    return () => window.removeEventListener('resize', cancel);
  }, [clearTimers]);

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(callback, delay);
    timers.current.push(timer);
  }, []);

  const runSpectralAction = useCallback(async <T,>(
    targetElement: HTMLElement,
    operation: () => Promise<T> | T,
    options: SpectralActionOptions = {},
  ): Promise<T> => {
    const actionAllowed = Boolean(options.action && isSpectralActionAllowed(options.action));
    const sourceElement = actionAllowed && !targetElement.matches(':disabled') ? findVisibleSource() : null;
    const reducedMotion = prefersReducedMotion();
    const id = ++effectId.current;
    clearTimers();

    if (sourceElement) {
      const source = centerOf(sourceElement.getBoundingClientRect());
      const target = centerOf(targetElement.getBoundingClientRect());
      const geometry = buildPath(source, target);
      const base: SpectralHookState = {
        id,
        phase: reducedMotion ? 'impact' : 'charging',
        outcome: 'pending',
        source,
        target,
        path: geometry.path,
        angle: geometry.angle,
        dimmed: false,
      };
      setState(base);

      if (!reducedMotion) {
        schedule(() => setState((current) => current?.id === id && current.phase === 'charging' ? { ...current, phase: 'traveling' } : current), 90);
        schedule(() => setState((current) => current?.id === id && current.phase === 'traveling' ? { ...current, phase: 'impact' } : current), 370);
        schedule(() => setState((current) => current?.id === id && current.phase === 'impact' ? { ...current, phase: 'tension' } : current), 480);
        schedule(() => setState((current) => current?.id === id && current.phase === 'tension' ? { ...current, dimmed: true } : current), 1800);
      }
    }

    try {
      const result = await operation();
      if (sourceElement) {
        const outcome = getSpectralOutcome(result);
        schedule(() => {
          setState((current) => current?.id === id
            ? { ...current, phase: outcome === 'success' ? 'returning' : 'broken', outcome }
            : current);
          if (outcome === 'success') {
            schedule(() => {
              sourceElement.classList.add('spectral-source--fed');
              schedule(() => sourceElement.classList.remove('spectral-source--fed'), 440);
            }, reducedMotion ? 0 : 280);
          }
          schedule(() => setState((current) => current?.id === id ? null : current), reducedMotion ? 180 : outcome === 'success' ? 440 : 300);
        }, options.immediate ? 110 : reducedMotion ? 0 : 480);
      }
      return result;
    } catch (error) {
      if (sourceElement) {
        schedule(() => {
          setState((current) => current?.id === id ? { ...current, phase: 'broken', outcome: 'failure' } : current);
          schedule(() => setState((current) => current?.id === id ? null : current), reducedMotion ? 180 : 300);
        }, reducedMotion ? 0 : 480);
      }
      throw error;
    }
  }, [clearTimers, schedule]);

  const value = useMemo(() => ({ state, runSpectralAction }), [state, runSpectralAction]);
  return <SpectralHookContext.Provider value={value}>{children}</SpectralHookContext.Provider>;
};

export const useSpectralAction = () => {
  const context = useContext(SpectralHookContext);
  if (!context) {
    return {
      runSpectralAction: async <T,>(_target: HTMLElement, operation: () => Promise<T> | T) => operation(),
    };
  }
  return { runSpectralAction: context.runSpectralAction };
};

export const useSpectralSource = () => useCallback((element: HTMLElement | null) => {
  if (element) element.dataset.spectralSource = 'true';
}, []);

export const SpectralHookLayer: React.FC<{ state?: SpectralHookState | null }> = ({ state: stateOverride }) => {
  const context = useContext(SpectralHookContext);
  const state = stateOverride === undefined ? context?.state ?? null : stateOverride;
  const path = state?.path ?? 'M 0 0 C 0 0, 0 0, 0 0';
  const source = state?.source ?? { x: 0, y: 0 };
  const target = state?.target ?? { x: 0, y: 0 };
  const phase = state?.phase ?? 'idle';
  const viewportWidth = typeof window === 'undefined' ? 1 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 1 : window.innerHeight;

  return (
    <svg
      className="spectral-hook"
      viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
      preserveAspectRatio="none"
      data-phase={phase}
      data-outcome={state?.outcome ?? 'pending'}
      data-dimmed={state?.dimmed ? 'true' : 'false'}
      aria-hidden="true"
      focusable="false"
      pointerEvents="none"
    >
      <path className="spectral-hook__tension" d={path} pathLength="100" />
      <path className="spectral-hook__chain" d={path} pathLength="100" />
      <g className="spectral-hook__hook-anchor" transform={`translate(${target.x} ${target.y}) rotate(${state?.angle ?? 0})`}>
        <g className="spectral-hook__hook">
          <path d="M -13 -7 C 2 -10 11 -3 9 7 C 7 15 -3 17 -10 11 L -2 7" />
          <path d="M -15 -8 L -8 -2" />
        </g>
      </g>
      <circle className="spectral-hook__impact" cx={target.x} cy={target.y} r="15" />
      <circle
        className="spectral-hook__soul"
        cx={target.x}
        cy={target.y}
        r="4"
        style={{ offsetPath: `path('${path}')` } as React.CSSProperties}
      />
      <g className="spectral-hook__break-anchor" transform={`translate(${target.x} ${target.y}) rotate(${state?.angle ?? 0})`}>
        <g className="spectral-hook__break">
          <path d="M -19 -8 L -9 -3 M -5 2 L 2 7 M 7 -7 L 15 -12" />
        </g>
      </g>
      <circle className="spectral-hook__source-lift" cx={source.x} cy={source.y} r="20" />
    </svg>
  );
};

export default SpectralHookLayer;
