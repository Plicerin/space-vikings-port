export type ShipModelKind = 1 | 3 | 4;

export interface ShipModelInfo {
  kind: ShipModelKind;
  name: string;
  shortName: string;
}

export const OPENING_COCKPIT_SHIP_KIND: ShipModelKind = 3;

export const SHIP_MODELS: ShipModelInfo[] = [
  { kind: 1, name: 'SPACE LAB', shortName: 'SPACE LAB' },
  { kind: 3, name: 'LIGHT CRUISER', shortName: 'SHIP 3' },
  { kind: 4, name: 'HEAVY CRUISER', shortName: 'SHIP 4' },
];

export function getShipModelInfo(kind: number): ShipModelInfo | null {
  return SHIP_MODELS.find((ship) => ship.kind === kind) ?? null;
}
