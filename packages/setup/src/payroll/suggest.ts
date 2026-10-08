import { FIELD_IDS, FIELDS, type FieldId, type Mapping } from './fields';
import { matchByHeader } from './match';
import type { Table } from './read';
import { columnShapes } from './shape';
import type { RoleInput, RoleOutput } from '@fork/models';

/** Calls the column matcher role. Absent in tests and when no model is configured. */
export type ColumnMatcher = (input: RoleInput<'column_matcher'>) => Promise<RoleOutput<'column_matcher'>>;

export interface Suggestion {
  mapping: Mapping;
  /** Fields the owner should check closely. */
  unsure: FieldId[];
  by: 'headers' | 'model';
}

/**
 * Suggest a mapping. Header words first; then the model, which sees only headers and value
 * shapes, may fill gaps or correct a match. Anything invalid it returns is ignored.
 */
export async function suggestMapping(table: Table, matcher?: ColumnMatcher): Promise<Suggestion> {
  const base = matchByHeader(table.headers);
  if (!matcher) return { mapping: base, unsure: [], by: 'headers' };
  let out: RoleOutput<'column_matcher'>;
  try {
    out = await matcher({
      columns: columnShapes(table),
      fields: FIELDS.map((f) => ({ id: f.id, label: f.label, description: f.description, required: f.required })),
    });
  } catch {
    return { mapping: base, unsure: [], by: 'headers' };
  }
  const isField = (x: string): x is FieldId => (FIELD_IDS as readonly string[]).includes(x);
  const mapping: Mapping = { ...base };
  for (const m of out.mapping) {
    if (isField(m.field) && m.header && table.headers.includes(m.header)) mapping[m.field] = m.header;
  }
  // One column per field: where the model and the headers disagree, keep the model's and flag the other.
  const unsure = new Set<FieldId>(out.unsure.filter(isField));
  const owner = new Map<string, FieldId>();
  for (const id of FIELD_IDS) {
    const h = mapping[id];
    if (!h) continue;
    if (owner.has(h)) {
      const modelSaid = out.mapping.some((m) => m.field === id && m.header === h);
      const loser = modelSaid ? owner.get(h)! : id;
      mapping[loser] = null;
      unsure.add(loser);
      if (modelSaid) owner.set(h, id);
    } else owner.set(h, id);
  }
  return { mapping, unsure: [...unsure], by: 'model' };
}
