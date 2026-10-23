import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";

function requireValue(condition, message) {
  if (!condition) throw new Error(`Spieledump: ${message}`);
}

// SQL is parsed as data, never executed. Comments and quoted semicolons may span lines.
export async function* readSqlStatements(file) {
  const input = createReadStream(file);
  const lines = createInterface({ input, crlfDelay: Infinity });
  let quote = null;
  let blockComment = false;
  let escaped = false;
  let parts = [];
  let length = 0;
  try {
    for await (const line of lines) {
      let start = 0;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];
        if (blockComment) {
          if (char === "*" && next === "/") { blockComment = false; i += 1; }
          start = i + 1;
        } else if (quote) {
          if (escaped) escaped = false;
          else if (char === "\\" && quote !== "`") escaped = true;
          else if (char === quote) {
            if (next === quote) i += 1;
            else quote = null;
          }
        } else if (char === "'" || char === '"' || char === "`") quote = char;
        else if ((char === "-" && next === "-" && /\s/u.test(line[i + 2] ?? " "))
          || char === "#") {
          parts.push(line.slice(start, i));
          start = line.length;
          break;
        } else if (char === "/" && next === "*") {
          parts.push(`${line.slice(start, i)} `);
          blockComment = true;
          i += 1;
          start = i + 1;
        } else if (char === ";") {
          parts.push(line.slice(start, i));
          const statement = parts.join("").trim();
          if (statement) yield statement;
          parts = [];
          length = 0;
          start = i + 1;
        }
      }
      parts.push(`${line.slice(start)}\n`);
      length += line.length;
      requireValue(length <= 32 * 1024 * 1024, "SQL-Anweisung größer als 32 MiB.");
      escaped = false;
    }
    requireValue(!quote && !blockComment, "Unvollständiger String oder Kommentar im Dump.");
    requireValue(!parts.join("").trim(), "SQL-Anweisung ohne abschließendes Semikolon.");
  } finally {
    lines.close();
    input.destroy();
  }
}

export function* parseSqlValues(text, width) {
  let i = 0;
  const space = () => { while (/\s/u.test(text[i] ?? "") && i < text.length) i += 1; };
  const escapes = { "0": "\0", b: "\b", n: "\n", r: "\r", t: "\t", Z: "\x1a" };
  while (i < text.length) {
    space();
    requireValue(text[i++] === "(", "Erwartete Wertetupel.");
    const row = [];
    for (;;) {
      space();
      if (text[i] === "'") {
        i += 1;
        let value = "";
        let closed = false;
        while (i < text.length) {
          const char = text[i++];
          if (char === "\\") {
            requireValue(i < text.length, "Unvollständiges SQL-Escaping.");
            const next = text[i++];
            value += escapes[next] ?? (next === "%" || next === "_" ? `\\${next}` : next);
          } else if (char === "'") {
            if (text[i] === "'") { value += "'"; i += 1; }
            else { closed = true; break; }
          } else value += char;
        }
        requireValue(closed, "Nicht abgeschlossener SQL-String.");
        row.push(value);
      } else {
        const start = i;
        while (i < text.length && ![",", ")"].includes(text[i])) i += 1;
        const value = text.slice(start, i).trim();
        requireValue(value === "NULL" || /^-?\d+$/u.test(value), `Nicht unterstützter SQL-Wert: ${value.slice(0, 60)}`);
        const number = value === "NULL" ? null : Number(value);
        requireValue(number === null || Number.isSafeInteger(number), "Ungültiger Integer.");
        row.push(number);
      }
      space();
      const separator = text[i++];
      if (separator === ")") break;
      requireValue(separator === ",", "Ungültiger Wertetrenner.");
    }
    requireValue(row.length === width, `Spaltenzahl ${row.length} statt ${width}.`);
    yield row;
    space();
    if (i === text.length) return;
    requireValue(text[i++] === ",", "Ungültiger Tupeltrenner.");
    space();
    requireValue(i < text.length, "Wertetupel nach Komma fehlt.");
  }
}

export async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
