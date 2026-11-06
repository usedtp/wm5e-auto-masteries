/*
 * Push (2024 PHB): on a hit, push a Large or smaller creature up to 10 ft straight away from the attacker.
 * Pure planning lives here so it is tested without Foundry; engine.mjs supplies snapping and collision.
 */

export const PUSHABLE = new Set(["tiny", "sm", "med", "lg"]);
export const STEPS = 2; // 10 ft in 5 ft squares

/** Unit vector from a to b, or null when they share a center. */
export function direction(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len ? { x: dx / len, y: dy / len } : null;
}

/** Rotate a unit vector by degrees (screen coordinates, y down). */
export function rotate(dir, degrees) {
  const r = degrees * Math.PI / 180;
  return { x: dir.x * Math.cos(r) - dir.y * Math.sin(r), y: dir.x * Math.sin(r) + dir.y * Math.cos(r) };
}

/** The 8 compass directions for the "player picks direction" house rule. */
export const COMPASS = Object.freeze({
  N: { x: 0, y: -1 }, NE: { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, E: { x: 1, y: 0 }, SE: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  S: { x: 0, y: 1 }, SW: { x: -Math.SQRT1_2, y: Math.SQRT1_2 }, W: { x: -1, y: 0 }, NW: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }
});

/**
 * Plan a push along one direction, square by square, stopping at the last open square.
 * Each step is measured from the starting center, so the path follows the straight line. Steps are counted in grid
 * squares (a diagonal square is 5 ft, the 2024 default), so the line advances one square per 5 ft at any angle.
 * @param {object} p
 * @param {{x:number,y:number}} p.center   Target's center (pixels).
 * @param {{x:number,y:number}} p.dir      Unit direction.
 * @param {number} p.size                  Grid square size (pixels).
 * @param {(point:{x:number,y:number}) => {x:number,y:number}} p.snapCenter  Center of the token position nearest a point.
 * @param {(from:{x:number,y:number}, to:{x:number,y:number}) => boolean} p.isOpen  Can the token move between these centers?
 * @param {number} [p.steps]
 * @returns {{x:number,y:number}[]}  Centers reached, one per 5 ft; empty when the first square is blocked.
 */
export function planPath({ center, dir, size, snapCenter, isOpen, steps = STEPS }) {
  const path = [];
  let from = center;
  const perSquare = size / (Math.max(Math.abs(dir.x), Math.abs(dir.y)) || 1);
  for (let k = 1; k <= steps; k++) {
    const to = snapCenter({ x: center.x + dir.x * perSquare * k, y: center.y + dir.y * perSquare * k });
    const moved = Math.round(to.x) !== Math.round(from.x) || Math.round(to.y) !== Math.round(from.y);
    if (!moved || !isOpen(from, to)) break;
    path.push(to);
    from = to;
  }
  return path;
}

/**
 * Pick the path to use. Straight line first; with the slide house rule, try 45 degrees either side when the straight
 * line is cut short, and take the one that goes farthest (straight wins ties).
 */
export function choosePath({ dir, slide, plan }) {
  const straight = plan(dir);
  if (!slide || straight.length >= STEPS) return { path: straight, slid: 0 };
  let best = { path: straight, slid: 0 };
  for (const deg of [45, -45]) {
    const p = plan(rotate(dir, deg));
    if (p.length > best.path.length) best = { path: p, slid: deg };
  }
  return best;
}

/** Distances (ft) the attacker can choose from a planned path. */
export const distances = (path, feetPerSquare = 5) => path.map((_, i) => (i + 1) * feetPerSquare);
