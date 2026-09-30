import {
  canMoveBetween,
  cellKey,
  getNeighbors,
  isWalkable,
  lineOfSight,
  nearestWalkableCell,
  type CellRef,
  type HospitalWorld,
} from "./world";

export type PathNode = CellRef & {
  f: number;
  g: number;
  h: number;
  parent?: PathNode;
};

export type PathOptions = {
  allowClosedDoors?: boolean;
  maxIterations?: number;
};

export { cellKey };

export function findPath(world: HospitalWorld, start: CellRef, goal: CellRef, options: PathOptions = {}): CellRef[] {
  const startCell = isWalkable(world, start.x, start.y, start.floor)
    ? start
    : nearestWalkableCell(world, start.x, start.y, start.floor);
  const goalCell = isWalkable(world, goal.x, goal.y, goal.floor) ? goal : nearestWalkableCell(world, goal.x, goal.y, goal.floor);

  const open = new Map<string, PathNode>();
  const closed = new Set<string>();
  const first: PathNode = {
    ...startCell,
    g: 0,
    h: heuristic(startCell, goalCell),
    f: heuristic(startCell, goalCell),
  };
  open.set(cellKey(first), first);

  let iterations = 0;
  const maxIterations = options.maxIterations ?? 5000;

  while (open.size && iterations < maxIterations) {
    iterations += 1;
    const current = lowest(open);
    if (same(current, goalCell)) return reconstruct(current);
    open.delete(cellKey(current));
    closed.add(cellKey(current));

    for (const neighbor of getNeighbors(world, current, options.allowClosedDoors ?? true)) {
      if (closed.has(cellKey(neighbor))) continue;
      const tentativeG = current.g + stepCost(world, current, neighbor);
      const existing = open.get(cellKey(neighbor));
      if (existing && tentativeG >= existing.g) continue;
      const h = heuristic(neighbor, goalCell);
      open.set(cellKey(neighbor), { ...neighbor, g: tentativeG, h, f: tentativeG + h, parent: current });
    }
  }

  return [];
}

export function simplifyPath(world: HospitalWorld, path: CellRef[]): CellRef[] {
  if (path.length <= 2) return path;
  const simplified: CellRef[] = [path[0]];
  let anchor = 0;
  for (let i = 2; i < path.length; i += 1) {
    if (path[anchor].floor !== path[i].floor || !lineOfSight(world, path[anchor], path[i], path[anchor].floor)) {
      simplified.push(path[i - 1]);
      anchor = i - 1;
    }
  }
  simplified.push(path[path.length - 1]);
  return simplified;
}

function stepCost(world: HospitalWorld, from: CellRef, to: CellRef) {
  if (from.floor !== to.floor) return 8;
  const move = canMoveBetween(world, from, to, from.floor) ? 1 : 2.5;
  const cell = world.floors[to.floor].cells[to.y]?.[to.x];
  return move + (cell?.slow ? 2.2 : 0);
}

function reconstruct(node: PathNode) {
  const path: CellRef[] = [];
  let cursor: PathNode | undefined = node;
  while (cursor) {
    path.push({ floor: cursor.floor, x: cursor.x, y: cursor.y });
    cursor = cursor.parent;
  }
  return path.reverse();
}

function heuristic(a: CellRef, b: CellRef) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (a.floor === b.floor ? 0 : 12);
}

function same(a: CellRef, b: CellRef) {
  return a.floor === b.floor && a.x === b.x && a.y === b.y;
}

function lowest(open: Map<string, PathNode>) {
  let best: PathNode | undefined;
  for (const node of open.values()) {
    if (!best || node.f < best.f || (node.f === best.f && node.h < best.h)) best = node;
  }
  if (!best) throw new Error("Cannot select from empty path list.");
  return best;
}
