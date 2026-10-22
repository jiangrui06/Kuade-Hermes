import { useEffect, useState } from 'react';
import type { CapabilityReport } from '../../shared/capabilities';

/** Poll upstream registration only; never infer task success from configuration. */
export function useCapabilityStatus(ready: boolean) {
  const [report, setReport] = useState<CapabilityReport>();
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    setReport(undefined); setError('');
    if (!ready) return;
    const refresh = async () => {
      try {
        const next = await window.kuade.call('extensions/status');
        if (current) { setReport(next); setError(''); }
      } catch (cause) { if (current) { setReport(undefined); setError((cause as Error).message); } }
      finally { if (current) timer = setTimeout(() => void refresh(), 5000); }
    };
    void refresh();
    return () => { current = false; clearTimeout(timer); };
  }, [ready, refreshKey]);
  return { report, error, refresh: () => setRefreshKey(value => value + 1) };
}
