import { useCallback, useState } from 'react';
import type { ApiClient, Flake, Summary, TimelineItem } from '../types';

export function useFlakes(api: ApiClient) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [flakes, setFlakes] = useState<Flake[]>([]);
  const [selected, setSelected] = useState<Flake | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const load = useCallback(async () => {
    const [nextSummary, nextFlakes] = await Promise.all([
      api<Summary>('/api/summary'),
      api<{ items: Flake[] }>('/api/flakes'),
    ]);
    setSummary(nextSummary);
    setFlakes(nextFlakes.items);
    setSelected(nextFlakes.items[0] ?? null);
  }, [api]);
  const loadTimeline = useCallback(async (testId: string) => {
    const result = await api<{ timeline: TimelineItem[] }>(`/api/tests/${encodeURIComponent(testId)}`);
    setTimeline(result.timeline);
  }, [api]);
  return { summary, flakes, selected, setSelected, setSummary, setFlakes, timeline, load, loadTimeline };
}
