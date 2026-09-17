type Point = { x: number; y: number };

// Work in displayed pixels so the same gesture behaves alike on phones and PCs.
export function straightenOutline(path: Point[], scaleX: number, scaleY: number): Point[] {
  if (path.length < 3 || scaleX <= 0 || scaleY <= 0) return path.map(p => ({ ...p }));
  const points = path.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));
  const result = points.map(p => ({ ...p }));
  for (const axis of ['x', 'y'] as const) {
    const other = axis === 'x' ? 'y' : 'x';
    const parent = points.map((_, i) => i);
    const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]));
    points.forEach((p, i) => {
      const j = (i + 1) % points.length, q = points[j];
      const across = Math.abs(p[axis] - q[axis]), along = Math.abs(p[other] - q[other]);
      if (along >= 8 && across <= 6 && across <= along * .14) parent[root(j)] = root(i);
    });
    const groups = new Map<number, number[]>();
    points.forEach((_, i) => { const key = root(i); groups.set(key, [...(groups.get(key) || []), i]); });
    for (const ids of groups.values()) {
      const values = ids.map(i => points[i][axis]);
      if (Math.max(...values) - Math.min(...values) > 6) continue;
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      ids.forEach(i => { result[i][axis] = average; });
    }
  }
  return result.map(p => ({ x: p.x / scaleX, y: p.y / scaleY }));
}
