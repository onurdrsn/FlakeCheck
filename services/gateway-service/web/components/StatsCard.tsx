import type { ReactNode } from 'react';

export function StatsCard({ label, value, detail, accent, children }: { label: string; value: string | number; detail: string; accent?: boolean; children?: ReactNode }) {
  return <div className={`metric${accent ? ' amber' : ''}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small>{children}</div>;
}
