import { createHash } from "node:crypto";

const groups = [
  ["Blue Byte Studio GmbH", ["Blue Byte Software GmbH", "Blue Byte Software GmbH & Co. KG"]],
  ["Cinemaware", ["Cinemaware Corporation"]],
  ["Max Design GesMBH", ["Max Design GmbH & Co."]],
  ["Adventuresoft Ltd.", ["Adventure Soft Publishing Ltd."]],
  ["MicroProse", ["MicroProse Ltd.", "MicroProse Software, Inc.", "MPS Labs"]],
  ["Interplay", ["Interplay Productions, Inc.", "Interplay Entertainment Corp."]],
  ["Westwood", ["Westwood Associates", "Westwood Studios, Inc."]],
  ["Gremlin", ["Gremlin Graphics Software Limited", "Gremlin Interactive Limited"]],
  ["Sierra", ["Sierra On-Line, Inc.", "Sierra Entertainment, Inc."]],
  ["Konami", ["Konami Co., Ltd.", "Konami, Inc."]],
  ["Mindscape", ["Mindscape International Ltd.", "Mindscape, Inc."]],
  ["Sun", ["Sun Electronics Corp.", "Sun Corporation of America"]],
  ["Virgin", ["Virgin Games, Ltd.", "Virgin Games, Inc.", "Virgin Interactive Entertainment, Inc.",
    "Virgin Interactive Entertainment (Europe) Ltd.", "Virgin Mastertronic Ltd."]],
];

export const companyNamesHash = createHash("sha256").update(JSON.stringify(groups)).digest("hex");
const aliases = new Map(groups.flatMap(([name, variants]) => [name, ...variants].map((variant) => [variant, name])));

export function normalizeCompanyName(value) {
  if (!value?.trim()) return null;
  // The dump separates multiple companies with a comma followed by a line break, unlike legal suffixes.
  return value.trim().split(/,\s*\r?\n\s*/u).map((name) => aliases.get(name.trim()) ?? name.trim()).join(", ");
}

export function normalizeReleaseCompanies(release) {
  const result = { ...release };
  for (const field of ["developer", "publisher"]) {
    result[field] = normalizeCompanyName(release[field]);
    if (result[field] !== release[field] && release[field] != null) {
      result[`source${field[0].toUpperCase()}${field.slice(1)}`] ??= release[field];
    }
  }
  return result;
}
