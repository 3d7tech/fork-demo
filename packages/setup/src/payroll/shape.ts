// Describe what a column holds without revealing any value. This is all the column matcher
// model sees: headers and shapes, never names or pay (data minimisation, ADR 0004).
import type { Cell, Table } from './read';

export type Shape = 'empty' | 'email' | 'date' | 'money' | 'percent' | 'number_0_100' | 'number_large' | 'number' | 'identifier' | 'text';

export interface ColumnShape {
  header: string;
  shape: Shape;
  /** Share of rows with a value, rounded to a tenth. */
  filled: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})$/;
const MONEY = /^£\s?[\d,]+(\.\d+)?$/;
const PERCENT = /^\d+(\.\d+)?\s?%$/;
const NUMBER = /^-?[\d,]+(\.\d+)?$/;
const IDENT = /^[A-Za-z]*\d+[A-Za-z\d-]*$/;

function shapeOf(c: Cell): Shape {
  if (c === null || c === '') return 'empty';
  if (c instanceof Date) return 'date';
  if (typeof c === 'number') return c <= 100 ? 'number_0_100' : c >= 1000 ? 'number_large' : 'number';
  const s = String(c).trim();
  if (EMAIL.test(s)) return 'email';
  if (DATE.test(s)) return 'date';
  if (MONEY.test(s)) return 'money';
  if (PERCENT.test(s)) return 'percent';
  if (NUMBER.test(s)) {
    const n = Number(s.replace(/,/g, ''));
    return n <= 100 ? 'number_0_100' : n >= 1000 ? 'number_large' : 'number';
  }
  if (IDENT.test(s)) return 'identifier';
  return 'text';
}

export function columnShapes(table: Table): ColumnShape[] {
  return table.headers.map((header, i) => {
    const shapes = table.rows.map((r) => shapeOf(r[i] ?? null));
    const filled = shapes.filter((s) => s !== 'empty');
    const counts = new Map<Shape, number>();
    for (const s of filled) counts.set(s, (counts.get(s) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'empty';
    return { header, shape: top, filled: Math.round((filled.length / Math.max(1, shapes.length)) * 10) / 10 };
  });
}
