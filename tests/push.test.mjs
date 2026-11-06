// Push planning (2024 PHB): straight line from attacker center through target center, 5 ft squares, stop when blocked.
import assert from "node:assert/strict";
import { direction, rotate, planPath, choosePath, distances, PUSHABLE, COMPASS } from "../scripts/engine/push.mjs";

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); console.log("ok  ", m); pass++; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

const GS = 100; // grid square in pixels, 5 ft
const snap = p => ({ x: Math.round((p.x - 50) / GS) * GS + 50, y: Math.round((p.y - 50) / GS) * GS + 50 });
const open = blocked => (from, to) => !blocked.some(b => b.x === to.x && b.y === to.y);

// Direction
const d = direction({ x: 50, y: 50 }, { x: 150, y: 50 });
ok(near(d.x, 1) && near(d.y, 0), "direction: east");
ok(direction({ x: 1, y: 1 }, { x: 1, y: 1 }) === null, "direction: same center gives none");
const r = rotate({ x: 1, y: 0 }, 90);
ok(near(r.x, 0) && near(r.y, 1), "rotate: 90 degrees (y down)");

// Straight east, both squares open: 10 ft
const center = { x: 150, y: 50 };
let path = planPath({ center, dir: { x: 1, y: 0 }, size: GS, snapCenter: snap, isOpen: open([]) });
ok(path.length === 2 && path[0].x === 250 && path[1].x === 350, "east: 5 ft then 10 ft");
ok(distances(path).join() === "5,10", "distances 5 and 10 ft");

// Blocked at the second square: stops at 5 ft
path = planPath({ center, dir: { x: 1, y: 0 }, size: GS, snapCenter: snap, isOpen: open([{ x: 350, y: 50 }]) });
ok(path.length === 1 && path[0].x === 250, "blocked at 10 ft: stops at 5 ft");

// Blocked at the first square: no push
path = planPath({ center, dir: { x: 1, y: 0 }, size: GS, snapCenter: snap, isOpen: open([{ x: 250, y: 50 }]) });
ok(path.length === 0, "blocked at 5 ft: no push");

// Diagonal line: attacker up-left of target pushes down-right
const diag = direction({ x: 50, y: 50 }, { x: 150, y: 150 });
path = planPath({ center: { x: 150, y: 150 }, dir: diag, size: GS, snapCenter: snap, isOpen: open([]) });
ok(path[0].x === 250 && path[0].y === 250 && path[1].x === 350 && path[1].y === 350, "diagonal: follows the line square by square");

// Shallow angle: path stays on the line, one square per step
const shallow = direction({ x: 50, y: 50 }, { x: 350, y: 150 });
path = planPath({ center: { x: 350, y: 150 }, dir: shallow, size: GS, snapCenter: snap, isOpen: open([]) });
ok(path.length === 2 && path.every((p, i) => Math.max(Math.abs(p.x - (i ? path[i - 1].x : 350)), Math.abs(p.y - (i ? path[i - 1].y : 150))) === GS), "shallow angle: one square per 5 ft");

// Slide house rule: blocked straight, open at 45 degrees
const plan = blocked => dir => planPath({ center, dir, size: GS, snapCenter: snap, isOpen: open(blocked) });
let c = choosePath({ dir: { x: 1, y: 0 }, slide: false, plan: plan([{ x: 250, y: 50 }]) });
ok(c.path.length === 0 && c.slid === 0, "PHB: blocked straight means no push, no slide");
c = choosePath({ dir: { x: 1, y: 0 }, slide: true, plan: plan([{ x: 250, y: 50 }]) });
ok(c.path.length === 2 && Math.abs(c.slid) === 45, "house rule: slides 45 degrees when blocked");
c = choosePath({ dir: { x: 1, y: 0 }, slide: true, plan: plan([]) });
ok(c.slid === 0 && c.path.length === 2, "house rule: straight wins when open");

// Size and compass
ok(PUSHABLE.has("lg") && !PUSHABLE.has("huge") && !PUSHABLE.has("grg"), "Large or smaller only");
ok(Object.keys(COMPASS).length === 8, "8 compass directions");

console.log(`push tests: ${pass} passed`);
