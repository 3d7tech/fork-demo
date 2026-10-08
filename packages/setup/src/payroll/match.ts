// Suggest which column holds each field, from header words alone. The column matcher model
// improves on this when it's available (suggest.ts); the owner always confirms.
import { FIELDS, type FieldId, type Mapping } from './fields';

export const normaliseHeader = (h: string) =>
  h
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[_\-()/]+/g, ' ')
    .replace(/[^a-z0-9% ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function matchByHeader(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const taken = new Set<string>();
  const norm = new Map(headers.map((h) => [h, normaliseHeader(h)]));
  const assign = (field: FieldId, test: (n: string) => boolean) => {
    if (mapping[field]) return;
    const hit = headers.find((h) => !taken.has(h) && test(norm.get(h)!));
    if (hit) {
      mapping[field] = hit;
      taken.add(hit);
    }
  };
  // Exact matches first, for every field, so "Employee" (a name) doesn't steal "Employee number".
  for (const f of FIELDS) assign(f.id, (n) => f.synonyms.includes(n));
  // Then headers that contain a multi-word synonym ("Basic annual salary (£)").
  for (const f of FIELDS) assign(f.id, (n) => f.synonyms.some((syn) => syn.includes(' ') && n.includes(syn)));
  // A full name isn't needed when first and last names are both there.
  if (mapping.first_name && mapping.last_name && mapping.name === undefined) mapping.name = null;
  for (const f of FIELDS) if (!(f.id in mapping)) mapping[f.id] = null;
  return mapping;
}
