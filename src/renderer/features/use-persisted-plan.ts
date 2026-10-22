import { useEffect, useState } from 'react';
import { readPersistedPlan, type PersistedPlan, type PlanAnchor, type PlanReadState } from './persisted-plan';

export function usePersistedPlan(sessionId: string, ready: boolean, anchor?: PlanAnchor) {
  const [result, setResult] = useState<{ sessionId: string; anchor: PlanAnchor; state: PlanReadState; plan?: PersistedPlan }>();
  useEffect(() => {
    if (!sessionId || !ready || !anchor) return;
    let cancelled = false;
    setResult({ sessionId, anchor, state: 'loading' });
    void readPersistedPlan(request => window.kuade.call('session/page', { request }), sessionId, anchor, () => cancelled)
      .then(plan => { if (!cancelled) setResult({ sessionId, anchor, state: 'loaded', plan }); })
      .catch(() => { if (!cancelled) setResult({ sessionId, anchor, state: 'error' }); });
    return () => { cancelled = true; };
  }, [sessionId, ready, anchor]);
  if (!anchor) return { state: 'loaded' as const, plan: undefined };
  return result?.sessionId === sessionId && result.anchor === anchor ? result : { state: 'loading' as const, plan: undefined };
}
