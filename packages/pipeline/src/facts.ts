import type { Fact } from '@fork/spec';

/** Who is asking. Employee facts are read only for that employee. */
export interface Subject {
  audience: 'employee' | 'owner';
  companyId: string;
  employeeId?: string;
}

/**
 * The data gatherer for Phase 1: code, not a model (ADR 0004). It returns only facts that
 * exist, each with its source; a missing fact stays missing and becomes a question.
 */
export interface FactStore {
  get(subject: Subject, ids: string[]): Promise<Fact[]>;
}

/** Facts held in memory, keyed by company and employee. Stands in for the database until step 6. */
export class InMemoryFactStore implements FactStore {
  constructor(private readonly data: { company: Record<string, Fact[]>; employee: Record<string, Fact[]> }) {}

  async get(subject: Subject, ids: string[]): Promise<Fact[]> {
    const company = this.data.company[subject.companyId] ?? [];
    const employee = subject.employeeId ? (this.data.employee[`${subject.companyId}/${subject.employeeId}`] ?? []) : [];
    const all = new Map([...company, ...employee].map((f) => [f.id, f]));
    return ids.flatMap((id) => (all.has(id) ? [all.get(id)!] : []));
  }
}
