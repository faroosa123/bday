export type FloorId = "reception" | "patient_wings" | "operating_section" | "basement";
export type Vec2Key = `${FloorId}:${number},${number}`;
export type CellType = "wall" | "corridor" | "room" | "stairs" | "elevator" | "water" | "exit";
export type ItemKind =
  | "security-key"
  | "ward-fuse"
  | "archive-code"
  | "generator-fuse"
  | "sound-lure"
  | "voice-dampener"
  | "silent-opener"
  | "battery";

export const CELL_SIZE = 2;

export type CellRef = {
  x: number;
  y: number;
  floor: FloorId;
};

export type Cell = CellRef & {
  type: CellType;
  room?: string;
  dark?: boolean;
  slow?: boolean;
};

export type Door = {
  id: string;
  floor: FloorId;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  name: string;
  open: boolean;
  lockedBy?: ItemKind | string;
  lockedText?: string;
};

export type ItemDefinition = WorldItem;

export type WorldItem = CellRef & {
  id: string;
  kind: ItemKind;
  name: string;
  description: string;
  collected?: boolean;
};

export type SoundEvent = CellRef & {
  id: string;
  intensity: number;
  timestamp: number;
  label: string;
};

export type Floor = {
  id: FloorId;
  name: string;
  width: number;
  height: number;
  cells: Cell[][];
};

export type Transition = {
  id: string;
  name: string;
  from: CellRef;
  to: CellRef;
  requiredFlag?: string;
  lockedText?: string;
};

export type HospitalWorld = {
  floors: Record<FloorId, Floor>;
  floorOrder: FloorId[];
  start: CellRef;
  monsterStart: CellRef;
  safeSpawns: Record<FloorId, CellRef>;
  patrolRoutes: Record<FloorId, CellRef[]>;
  transitions: Transition[];
  doors: Door[];
  items: WorldItem[];
  soundEvents: SoundEvent[];
  exit: CellRef;
  flags: Record<string, boolean>;
};

const WIDTH = 32;
const HEIGHT = 22;
const FLOOR_ORDER: FloorId[] = ["reception", "patient_wings", "operating_section", "basement"];

export function createHospitalWorld(): HospitalWorld {
  const world: HospitalWorld = {
    floors: {
      reception: createFloor("reception", "Reception / Entry"),
      patient_wings: createFloor("patient_wings", "Patient Wings"),
      operating_section: createFloor("operating_section", "Operating Section"),
      basement: createFloor("basement", "Basement"),
    },
    floorOrder: FLOOR_ORDER,
    start: { floor: "reception", x: 6, y: 18 },
    monsterStart: { floor: "patient_wings", x: 16, y: 16 },
    safeSpawns: {
      reception: { floor: "reception", x: 6, y: 18 },
      patient_wings: { floor: "patient_wings", x: 28, y: 7 },
      operating_section: { floor: "operating_section", x: 4, y: 4 },
      basement: { floor: "basement", x: 5, y: 7 },
    },
    patrolRoutes: {
      reception: [],
      patient_wings: [],
      operating_section: [],
      basement: [],
    },
    transitions: [],
    doors: [],
    items: [],
    soundEvents: [],
    exit: { floor: "basement", x: 29, y: 18 },
    flags: {
      devMode: false,
      showEvents: false,
      showPaths: false,
      invincible: false,
      freezeTime: false,
      elevatorPowered: false,
      archiveUnlocked: false,
      generatorOnline: false,
    },
  };

  buildReception(world);
  buildPatientWings(world);
  buildOperatingSection(world);
  buildBasement(world);
  world.patrolRoutes = buildPatrolRoutes();
  return world;
}

export function cellKey(cell: CellRef): Vec2Key {
  return `${cell.floor}:${cell.x},${cell.y}` as Vec2Key;
}

export function cellToWorld(cell: { x: number; y: number; floor: FloorId }): { x: number; y: number; z: number } {
  return {
    x: cell.x * CELL_SIZE,
    y: 0,
    z: cell.y * CELL_SIZE,
  };
}

export function worldToCell(pos: { x: number; y: number; z: number }, floor: FloorId = "reception"): CellRef {
  return {
    x: Math.round(pos.x / CELL_SIZE),
    y: Math.round(pos.z / CELL_SIZE),
    floor,
  };
}

export function getCellAt(world: HospitalWorld, x: number, y: number, floor: FloorId): Cell | undefined {
  return world.floors[floor]?.cells[y]?.[x];
}

export function isWalkable(world: HospitalWorld, x: number, y: number, floor: FloorId): boolean {
  const cell = getCellAt(world, x, y, floor);
  return Boolean(cell && cell.type !== "wall");
}

export function canMoveBetween(world: HospitalWorld, a: CellRef, b: CellRef, floor: FloorId): boolean {
  if (a.floor !== floor || b.floor !== floor) return false;
  if (!isWalkable(world, b.x, b.y, floor)) return false;
  if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1) return false;
  const door = getDoorBetween(world, a, b, floor);
  return !door || door.open;
}

export function getDoorBetween(world: HospitalWorld, a: CellRef, b: CellRef, floor: FloorId): Door | undefined {
  return world.doors.find(
    (door) =>
      door.floor === floor &&
      ((door.ax === a.x && door.ay === a.y && door.bx === b.x && door.by === b.y) ||
        (door.ax === b.x && door.ay === b.y && door.bx === a.x && door.by === a.y)),
  );
}

export function nearestWalkableCell(world: HospitalWorld, x: number, y: number, floor: FloorId): CellRef {
  const start = { x, y, floor };
  if (isWalkable(world, x, y, floor)) return start;
  const queue: CellRef[] = [start];
  const seen = new Set<string>([cellKey(start)]);

  while (queue.length) {
    const current = queue.shift()!;
    for (const next of orthogonal(current)) {
      const key = cellKey(next);
      if (seen.has(key) || !inBounds(world, next)) continue;
      if (isWalkable(world, next.x, next.y, floor)) return next;
      seen.add(key);
      queue.push(next);
    }
  }
  return { floor, x: 1, y: 1 };
}

export function lineOfSight(world: HospitalWorld, a: { x: number; y: number }, b: { x: number; y: number }, floor: FloorId): boolean {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx - dy;
  let x = a.x;
  let y = a.y;
  let prev: CellRef = { floor, x, y };

  while (true) {
    const current = { floor, x, y };
    if (!isWalkable(world, x, y, floor)) return false;
    const door = getDoorBetween(world, prev, current, floor);
    if (door && !door.open) return false;
    if (x === b.x && y === b.y) return true;
    prev = current;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

export function getDoorNear(world: HospitalWorld, position: { x: number; z: number }, yaw: number, floor: FloorId): Door | undefined {
  const origin = worldToCell({ x: position.x, y: 0, z: position.z }, floor);
  const forward = { x: Math.round(Math.sin(yaw)), y: Math.round(Math.cos(yaw)) };
  const candidates = [
    { floor, x: origin.x + forward.x, y: origin.y + forward.y },
    { floor, x: origin.x + 1, y: origin.y },
    { floor, x: origin.x - 1, y: origin.y },
    { floor, x: origin.x, y: origin.y + 1 },
    { floor, x: origin.x, y: origin.y - 1 },
  ];
  for (const candidate of candidates) {
    const door = getDoorBetween(world, origin, candidate, floor);
    if (door) return door;
  }
  return undefined;
}

export function getItemNear(world: HospitalWorld, position: { x: number; z: number }, floor: FloorId): WorldItem | undefined {
  return world.items
    .filter((item) => item.floor === floor && !item.collected)
    .map((item) => ({ item, distance: Math.hypot(item.x * CELL_SIZE - position.x, item.y * CELL_SIZE - position.z) }))
    .filter((entry) => entry.distance <= 1.85)
    .sort((a, b) => a.distance - b.distance)[0]?.item;
}

export function getInteractableTransition(
  world: HospitalWorld,
  position: { x: number; z: number },
  floor: FloorId,
): Transition | undefined {
  return world.transitions
    .filter((transition) => transition.from.floor === floor)
    .map((transition) => ({
      transition,
      distance: Math.hypot(transition.from.x * CELL_SIZE - position.x, transition.from.y * CELL_SIZE - position.z),
    }))
    .filter((entry) => entry.distance <= 2.1)
    .sort((a, b) => a.distance - b.distance)[0]?.transition;
}

export function getObjectiveText(world: HospitalWorld, floor: FloorId): string {
  if (!world.flags["security-key"] && floor === "reception") return "Find the security key and reach the patient wing stairs.";
  if (!world.flags.elevatorPowered) return "Find a ward fuse in the patient wings and repair the nurse station relay.";
  if (!world.flags.archiveUnlocked) return "Reach the operating section, recover the archive code, and unlock the elevator controls.";
  if (!world.flags.generatorOnline) return "Descend to the basement, install the generator fuse, then reach the exit tunnel.";
  return "The exit tunnel is open. Leave St. Moura Hospital.";
}

export function inBounds(world: HospitalWorld, cell: CellRef): boolean {
  const floor = world.floors[cell.floor];
  return cell.x >= 0 && cell.y >= 0 && cell.x < floor.width && cell.y < floor.height;
}

export function getNeighbors(world: HospitalWorld, cell: CellRef, allowClosedDoors = false): CellRef[] {
  const result: CellRef[] = [];
  for (const next of orthogonal(cell)) {
    if (!inBounds(world, next) || !isWalkable(world, next.x, next.y, next.floor)) continue;
    const door = getDoorBetween(world, cell, next, cell.floor);
    if (door && !door.open && !allowClosedDoors) continue;
    result.push(next);
  }
  for (const transition of world.transitions) {
    if (sameCell(transition.from, cell) && (!transition.requiredFlag || world.flags[transition.requiredFlag])) result.push({ ...transition.to });
  }
  return result;
}

function createFloor(id: FloorId, name: string): Floor {
  const cells: Cell[][] = [];
  for (let y = 0; y < HEIGHT; y += 1) {
    const row: Cell[] = [];
    for (let x = 0; x < WIDTH; x += 1) row.push({ floor: id, x, y, type: "wall" });
    cells.push(row);
  }
  return { id, name, width: WIDTH, height: HEIGHT, cells };
}

function buildReception(world: HospitalWorld) {
  const floor = world.floors.reception;
  carve(floor, 2, 13, 12, 20, "room", "Waiting Area");
  carve(floor, 13, 13, 22, 20, "room", "Reception Desk");
  carve(floor, 23, 13, 29, 20, "room", "Triage");
  carve(floor, 3, 3, 12, 11, "room", "Security Checkpoint");
  carve(floor, 13, 5, 29, 11, "corridor", "Entry Corridor");
  carve(floor, 6, 11, 6, 13, "corridor", "Lobby Link");
  carve(floor, 18, 11, 18, 13, "corridor", "Reception Link");
  carve(floor, 28, 7, 28, 7, "stairs", "Patient Wing Stairwell");
  carve(floor, 4, 7, 4, 7, "stairs", "Service Stairwell");
  addDoor(world, "reception-security", "reception", 6, 13, 6, 12, "Security checkpoint", "security-key", "A security key is required.");
  addDoor(world, "reception-triage", "reception", 22, 16, 23, 16, "Triage door");
  addTransition(world, "stairs-reception-wings", "Climb to Patient Wings", { floor: "reception", x: 28, y: 7 }, { floor: "patient_wings", x: 28, y: 7 }, "security-key", "The security checkpoint is still locked.");
  addTransition(world, "stairs-reception-basement", "Descend service stairs", { floor: "reception", x: 4, y: 7 }, { floor: "basement", x: 4, y: 7 }, "archiveUnlocked", "The basement stair gate needs elevator-control authorization.");
  addItem(world, "security-key", "security-key", "Security Key", "A brass key stamped CHECKPOINT.", "reception", 16, 16);
  addItem(world, "reception-battery", "battery", "Battery", "A half-used flashlight battery.", "reception", 7, 15);
  addItem(world, "voice-dampener", "voice-dampener", "Voice Dampener", "A cracked mask that softens microphone noise.", "reception", 9, 6);
}

function buildPatientWings(world: HospitalWorld) {
  const floor = world.floors.patient_wings;
  carve(floor, 2, 3, 29, 6, "corridor", "Nurse Station");
  carve(floor, 14, 4, 17, 19, "corridor", "Central Corridor");
  for (const y of [8, 11, 14, 17]) {
    carve(floor, 3, y, 12, y + 2, "room", "North Patient Rooms", y === 14);
    carve(floor, 19, y, 29, y + 2, "room", "South Patient Rooms", y === 17);
    addDoor(world, `north-room-${y}`, "patient_wings", 13, y + 1, 14, y + 1, "Patient room door");
    addDoor(world, `south-room-${y}`, "patient_wings", 17, y + 1, 18, y + 1, "Patient room door");
  }
  carve(floor, 28, 7, 28, 7, "stairs", "Reception Stairwell");
  carve(floor, 4, 4, 4, 4, "stairs", "Operating Stairs");
  addTransition(world, "stairs-wings-reception", "Return to Reception", { floor: "patient_wings", x: 28, y: 7 }, { floor: "reception", x: 28, y: 7 });
  addTransition(world, "stairs-wings-operating", "Climb to Operating Section", { floor: "patient_wings", x: 4, y: 4 }, { floor: "operating_section", x: 4, y: 4 }, "elevatorPowered", "The stairwell lock needs the nurse station relay powered.");
  addItem(world, "ward-fuse", "ward-fuse", "Ward Fuse", "A ceramic fuse from the nurse station drawer.", "patient_wings", 24, 18);
  addItem(world, "sound-lure", "sound-lure", "Sound Lure", "A sputtering pager that can fake a loud noise.", "patient_wings", 8, 10);
  addItem(world, "wings-battery", "battery", "Battery", "A dry-cell battery beneath a bed.", "patient_wings", 22, 9);
  floor.cells[13][16].dark = true;
}

function buildOperatingSection(world: HospitalWorld) {
  const floor = world.floors.operating_section;
  carve(floor, 2, 2, 8, 7, "room", "Scrub Room");
  carve(floor, 10, 2, 21, 10, "room", "Operating Rooms", true);
  carve(floor, 22, 2, 29, 10, "room", "Recovery");
  carve(floor, 4, 12, 28, 18, "corridor", "Medical Archive");
  carve(floor, 8, 6, 22, 6, "corridor", "Surgical Hall");
  carve(floor, 16, 10, 16, 12, "elevator", "Elevator Control");
  carve(floor, 4, 4, 4, 4, "stairs", "Patient Wing Stairs");
  addDoor(world, "or-scrub", "operating_section", 8, 6, 9, 6, "Scrub room door");
  addDoor(world, "or-recovery", "operating_section", 21, 6, 22, 6, "Recovery door");
  addDoor(world, "archive-door", "operating_section", 16, 11, 16, 12, "Archive shutter", "archive-code", "The archive shutter needs the recovered code.");
  addTransition(world, "stairs-operating-wings", "Return to Patient Wings", { floor: "operating_section", x: 4, y: 4 }, { floor: "patient_wings", x: 4, y: 4 });
  addTransition(world, "elevator-operating-basement", "Take elevator to Basement", { floor: "operating_section", x: 16, y: 12 }, { floor: "basement", x: 16, y: 14 }, "archiveUnlocked", "The elevator controls are locked.");
  addItem(world, "archive-code", "archive-code", "Archive Code", "A blood-streaked access card with a stamped code.", "operating_section", 12, 8);
  addItem(world, "silent-opener", "silent-opener", "Silent Door Opener", "A rubberized pry tool for quieter doors.", "operating_section", 25, 6);
  addItem(world, "generator-fuse", "generator-fuse", "Generator Fuse", "A heavy cartridge fuse for the basement generator.", "operating_section", 24, 15);
}

function buildBasement(world: HospitalWorld) {
  const floor = world.floors.basement;
  carve(floor, 2, 3, 11, 12, "room", "Boiler Room", true);
  carve(floor, 13, 3, 21, 12, "room", "Records Storage");
  carve(floor, 23, 3, 29, 12, "room", "Morgue", true);
  carve(floor, 4, 15, 29, 19, "water", "Flooded Corridors", true);
  carve(floor, 11, 7, 23, 7, "corridor", "Pipe Corridor");
  carve(floor, 16, 12, 16, 15, "elevator", "Generator Room");
  carve(floor, 4, 7, 4, 7, "stairs", "Service Stairs");
  carve(floor, 29, 18, 29, 18, "exit", "Exit Tunnel");
  addDoor(world, "records-door", "basement", 12, 7, 13, 7, "Records door");
  addDoor(world, "morgue-door", "basement", 22, 7, 23, 7, "Morgue door");
  addTransition(world, "stairs-basement-reception", "Return to Reception", { floor: "basement", x: 4, y: 7 }, { floor: "reception", x: 4, y: 7 });
  addTransition(world, "elevator-basement-operating", "Take elevator to Operating Section", { floor: "basement", x: 16, y: 14 }, { floor: "operating_section", x: 16, y: 12 });
  addItem(world, "basement-battery", "battery", "Battery", "A sealed emergency battery.", "basement", 18, 6);
  addItem(world, "basement-lure", "sound-lure", "Sound Lure", "A backup lure floating in the water.", "basement", 26, 17);
}

function buildPatrolRoutes(): Record<FloorId, CellRef[]> {
  return {
    reception: [
      { floor: "reception", x: 6, y: 18 },
      { floor: "reception", x: 18, y: 16 },
      { floor: "reception", x: 27, y: 8 },
      { floor: "reception", x: 7, y: 6 },
    ],
    patient_wings: [
      { floor: "patient_wings", x: 28, y: 7 },
      { floor: "patient_wings", x: 16, y: 18 },
      { floor: "patient_wings", x: 8, y: 12 },
      { floor: "patient_wings", x: 24, y: 15 },
      { floor: "patient_wings", x: 15, y: 5 },
    ],
    operating_section: [
      { floor: "operating_section", x: 4, y: 4 },
      { floor: "operating_section", x: 16, y: 6 },
      { floor: "operating_section", x: 26, y: 6 },
      { floor: "operating_section", x: 24, y: 15 },
      { floor: "operating_section", x: 12, y: 15 },
    ],
    basement: [
      { floor: "basement", x: 4, y: 7 },
      { floor: "basement", x: 18, y: 7 },
      { floor: "basement", x: 26, y: 7 },
      { floor: "basement", x: 25, y: 17 },
      { floor: "basement", x: 8, y: 17 },
    ],
  };
}

function carve(floor: Floor, x1: number, y1: number, x2: number, y2: number, type: CellType, room: string, dark = false) {
  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) {
      if (!floor.cells[y]?.[x]) continue;
      floor.cells[y][x] = {
        floor: floor.id,
        x,
        y,
        type,
        room: type === "room" || type === "water" ? room : undefined,
        dark,
        slow: type === "water",
      };
    }
  }
}

function addDoor(
  world: HospitalWorld,
  id: string,
  floor: FloorId,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  name: string,
  lockedBy?: string,
  lockedText?: string,
) {
  world.doors.push({ id, floor, ax, ay, bx, by, name, open: false, lockedBy, lockedText });
}

function addItem(
  world: HospitalWorld,
  id: string,
  kind: ItemKind,
  name: string,
  description: string,
  floor: FloorId,
  x: number,
  y: number,
) {
  world.items.push({ id, kind, name, description, floor, x, y });
}

function addTransition(
  world: HospitalWorld,
  id: string,
  name: string,
  from: CellRef,
  to: CellRef,
  requiredFlag?: string,
  lockedText?: string,
) {
  world.transitions.push({ id, name, from, to, requiredFlag, lockedText });
}

function orthogonal(cell: CellRef): CellRef[] {
  return [
    { floor: cell.floor, x: cell.x + 1, y: cell.y },
    { floor: cell.floor, x: cell.x - 1, y: cell.y },
    { floor: cell.floor, x: cell.x, y: cell.y + 1 },
    { floor: cell.floor, x: cell.x, y: cell.y - 1 },
  ];
}

function sameCell(a: CellRef, b: CellRef): boolean {
  return a.floor === b.floor && a.x === b.x && a.y === b.y;
}
