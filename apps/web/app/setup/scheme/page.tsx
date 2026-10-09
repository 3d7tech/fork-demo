import { confirmedFacts, readCompany } from '@fork/setup';
import { database } from '@/lib/db';
import { requireOwner } from '@/lib/viewer';
import { saveSchemeAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SchemePage() {
  const { ctx } = await requireOwner();
  const scheme = (await readCompany(database(), ctx))?.scheme;
  // Before the scheme is saved, start from what the owner confirmed in the scheme booklet.
  const facts = scheme ? null : await confirmedFacts(database(), ctx);
  const fromDoc = (key: string) => facts?.get(key)?.value;
  const docName = facts?.get('employer_pct')?.fileName ?? facts?.get('relief_method')?.fileName;
  return (
    <section className="card" aria-labelledby="sc-title">
      <a href="/setup" className="back">
        ‹ Setup
      </a>
      <h1 id="sc-title">Pension scheme</h1>
      <p className="lead">Your scheme booklet or provider’s portal will have these.</p>
      {docName && <p className="notice">Filled in from {docName}, as you confirmed it. Check before saving.</p>}
      <form action={saveSchemeAction} className="form">
        <div className="field">
          <label htmlFor="name">Scheme name</label>
          <input id="name" name="name" type="text" defaultValue={scheme?.name ?? ''} required />
        </div>
        <div className="field">
          <label htmlFor="provider">Provider (optional)</label>
          <input id="provider" name="provider" type="text" defaultValue={scheme?.provider ?? String(fromDoc('pension_provider') ?? '')} />
        </div>
        <div className="field">
          <label htmlFor="er">Employer contribution (%)</label>
          <input id="er" name="employerPct" type="number" inputMode="decimal" min={0} max={100} step={0.5} defaultValue={scheme ? Number(scheme.employerPct) : Number(fromDoc('employer_pct') ?? 3)} required />
        </div>
        <div className="field">
          <label htmlFor="ee">Standard employee contribution (%)</label>
          <span className="hint" id="ee-hint">
            Used when the payroll export doesn’t show someone’s own rate.
          </span>
          <input id="ee" name="employeeDefaultPct" type="number" inputMode="decimal" min={0} max={100} step={0.5} defaultValue={scheme ? Number(scheme.employeeDefaultPct) : Number(fromDoc('employee_default_pct') ?? 5)} aria-describedby="ee-hint" required />
        </div>
        <fieldset className="field">
          <legend>How tax relief is given</legend>
          <label className="choice">
            <input type="radio" name="reliefMethod" value="relief_at_source" defaultChecked={(scheme?.reliefMethod ?? fromDoc('relief_method') ?? 'relief_at_source') === 'relief_at_source'} />
            <span>Relief at source: the provider claims basic-rate relief and adds it</span>
          </label>
          <label className="choice">
            <input type="radio" name="reliefMethod" value="net_pay" defaultChecked={(scheme?.reliefMethod ?? fromDoc('relief_method')) === 'net_pay'} />
            <span>Net pay: contributions come out before tax</span>
          </label>
        </fieldset>
        <fieldset className="field">
          <legend>Contributions are worked out on</legend>
          <label className="choice">
            <input type="radio" name="basis" value="full_salary" defaultChecked={(scheme?.basis ?? fromDoc('contribution_basis') ?? 'full_salary') === 'full_salary'} />
            <span>Full salary</span>
          </label>
          <label className="choice">
            <input type="radio" name="basis" value="qualifying_earnings" defaultChecked={(scheme?.basis ?? fromDoc('contribution_basis')) === 'qualifying_earnings'} />
            <span>Qualifying earnings (pay between the lower and upper limits)</span>
          </label>
        </fieldset>
        <button type="submit" className="fk-btn fk-primary">
          Save
        </button>
      </form>
    </section>
  );
}
