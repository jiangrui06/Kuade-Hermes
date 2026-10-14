import { useCallback, useEffect, useRef, useState } from 'react';

export function useModels(ready: boolean) {
  const [catalog, setCatalog] = useState<any>({ groups: [], failures: [] });
  const [model, chooseModel] = useState(() => localStorage.getItem('kuade:model') ?? '');
  const [effort, chooseEffort] = useState('');
  const [capability, setCapability] = useState<any>();
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [modelError, setModelError] = useState('');
  const pending = useRef<Promise<void> | undefined>(undefined);
  const refreshModels = useCallback((force = true): Promise<void> => {
    if (pending.current) return pending.current;
    setLoading(true);
    const promise = window.kuade.call('models/catalog', { refresh: force }).then(response => {
      setCatalog(response); setModelError(response.failures?.map((item: any) => `${item.name}：${item.message}`).join('；') ?? '');
      const values = response.groups.flatMap((group: any) => group.models.map((item: any) => `${group.id}::${item.id}`));
      chooseModel(previous => values.includes(previous) ? previous : values.includes(`${response.default?.provider}::${response.default?.model}`) ? `${response.default.provider}::${response.default.model}` : values[0] ?? '');
    }).catch(error => setModelError(error.message)).finally(() => { setLoading(false); pending.current = undefined; });
    pending.current = promise; return promise;
  }, []);
  useEffect(() => { if (ready) void refreshModels(); }, [ready, refreshModels]);
  useEffect(() => {
    setCapability(undefined); setModelError('');
    if (!model || !ready) { setPreparing(false); return; }
    let stale = false;
    localStorage.setItem('kuade:model', model);
    chooseEffort(localStorage.getItem('kuade:effort:' + model) ?? '');
    setPreparing(true);
    const [provider, ...parts] = model.split('::');
    void window.kuade.call('models/prepare', { provider, model: parts.join('::') }).then(info => {
      if (stale) return;
      setCapability(info);
      chooseEffort(previous => info.reasoning?.efforts?.some((item: any) => item.id === previous) ? previous : '');
    }).catch(error => { if (!stale) setModelError(error.message); }).finally(() => { if (!stale) setPreparing(false); });
    return () => { stale = true; };
  }, [model, ready]);
  const setModel = useCallback((value: string) => { chooseModel(value); chooseEffort(''); }, []);
  const setEffort = (value: string) => { chooseEffort(value); localStorage.setItem('kuade:effort:' + model, value); };
  const restoreSelection = useCallback((selection: any) => {
    const value = `${selection.provider}::${selection.model}`;
    localStorage.setItem('kuade:effort:' + value, selection.reasoningEffort ?? '');
    chooseModel(value); chooseEffort(selection.reasoningEffort ?? '');
  }, []);
  return { catalog, model, setModel, effort, setEffort, capability, loading, preparing, modelError, refreshModels, restoreSelection };
}
