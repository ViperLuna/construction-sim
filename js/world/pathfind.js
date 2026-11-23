// Shortest path over the road graph (Dijkstra). The graph is small, so a
// simple array scan is plenty fast and easy to read.

export function findPath(world, fromId, toId) {
  const { nodes, adj } = world;
  const dist = new Array(nodes.length).fill(Infinity);
  const prev = new Array(nodes.length).fill(-1);
  const done = new Array(nodes.length).fill(false);
  dist[fromId] = 0;

  for (let step = 0; step < nodes.length; step++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (!done[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1 || u === toId) break;
    done[u] = true;
    for (const edge of adj[u]) {
      const alt = dist[u] + edge.d;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = u;
      }
    }
  }

  if (dist[toId] === Infinity) return null;
  const path = [];
  for (let at = toId; at !== -1; at = prev[at]) path.push(at);
  path.reverse();
  return { path, distance: dist[toId] };
}
