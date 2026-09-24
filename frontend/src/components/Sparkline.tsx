export function Sparkline({ values, label = "Trend" }: { values: number[]; label?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  const points = values.map((value, index) => `${2 + index / (values.length - 1) * 156},${span === 0 ? 20 : 38 - (value - min) / span * 36}`).join(" ");
  return <svg viewBox="0 0 160 40" className="h-16 w-64 max-w-full text-green-700" role="img" aria-label={label}>
    <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
  </svg>;
}
