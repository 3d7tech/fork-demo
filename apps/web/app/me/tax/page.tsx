import { deleteTaxProfile, readTaxProfile, saveTaxProfile } from '@fork/setup';
import { redirect } from 'next/navigation';
import { database } from '@/lib/db';
import { requireMember } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

const PLANS: Array<[string, string]> = [
  ['plan_1', 'Plan 1'],
  ['plan_2', 'Plan 2'],
  ['plan_4', 'Plan 4 (Scotland)'],
  ['plan_5', 'Plan 5'],
  ['postgraduate', 'Postgraduate loan'],
];

async function employee() {
  const v = await requireMember();
  if (v.role !== 'employee' || !v.subject.employeeId) redirect('/me');
  return { ctx: v.ctx, employeeId: v.subject.employeeId };
}

const money = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').replace(/[£,\s]/g, '');
  return s === '' ? null : Number(s);
};
const yesNo = (v: FormDataEntryValue | null) => (v === 'yes' ? true : v === 'no' ? false : null);

async function save(form: FormData) {
  'use server';
  const { ctx, employeeId } = await employee();
  const region = form.get('taxRegion');
  const loans = form.getAll('studentLoans').map(String);
  await saveTaxProfile(database(), ctx, employeeId, {
    taxRegion: region === 'scotland' || region === 'rest_of_uk' ? region : null,
    studentLoans: loans.includes('none') ? [] : loans.length ? loans : null,
    variablePay: money(form.get('variablePay')),
    otherIncome: money(form.get('otherIncome')),
    childBenefitChildren: money(form.get('childBenefitChildren')),
    higherEarner: yesNo(form.get('higherEarner')),
    otherPensionSavings: money(form.get('otherPensionSavings')),
    flexiblyAccessed: yesNo(form.get('flexiblyAccessed')),
  });
  redirect('/me/tax?saved=1');
}

async function remove() {
  'use server';
  const { ctx } = await employee();
  await deleteTaxProfile(database(), ctx);
  redirect('/me/tax?deleted=1');
}

/** "Your tax details" (ADR 0010): what changes the sums beyond pay. Private to the employee. */
export default async function TaxDetails({ searchParams }: { searchParams: Promise<{ saved?: string; deleted?: string }> }) {
  const { ctx, employeeId } = await employee();
  const p = await readTaxProfile(database(), ctx, employeeId);
  const { saved, deleted } = await searchParams;
  const radio = (name: string, value: string, label: string, checked: boolean) => (
    <label className="choice">
      <input type="radio" name={name} value={value} defaultChecked={checked} />
      <span>{label}</span>
    </label>
  );
  return (
    <section className="card" aria-labelledby="tax-title">
      <a href="/me" className="back">
        ‹ Your data
      </a>
      <h1 id="tax-title">Your tax details</h1>
      {saved && (
        <p className="notice" role="status">
          Saved. Your next answers use these details.
        </p>
      )}
      {deleted && (
        <p className="notice" role="status">
          Deleted. Fork will ask again when it needs to.
        </p>
      )}
      <p className="lead">These change how much tax, National Insurance and student loan you pay, so Fork’s numbers fit you. Only you can see them: your employer can’t.</p>
      <form action={save} className="form">
        <fieldset className="field">
          <legend>Do you pay Scottish income tax?</legend>
          <span className="hint">If you do, the tax code on your payslip starts with S.</span>
          {radio('taxRegion', 'scotland', 'Yes', p.taxRegion === 'scotland')}
          {radio('taxRegion', 'rest_of_uk', 'No', p.taxRegion === 'rest_of_uk')}
        </fieldset>
        <fieldset className="field">
          <legend>Student loans you repay through your pay</legend>
          <span className="hint">Your payslip shows them as student loan or SL.</span>
          <label className="choice">
            <input type="checkbox" name="studentLoans" value="none" defaultChecked={p.studentLoans?.length === 0} />
            <span>None</span>
          </label>
          {PLANS.map(([id, label]) => (
            <label key={id} className="choice">
              <input type="checkbox" name="studentLoans" value={id} defaultChecked={!!p.studentLoans?.includes(id)} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="variable">Overtime, commission or bonus a year (£)</label>
          <span className="hint" id="variable-hint">
            Your best guess at what you’ll get on top of your salary this year. Leave empty for none.
          </span>
          <input id="variable" name="variablePay" type="number" inputMode="decimal" min={0} step={100} defaultValue={p.variablePay ?? ''} aria-describedby="variable-hint" />
        </div>
        <div className="field">
          <label htmlFor="other">Taxable income outside this job a year (£)</label>
          <span className="hint" id="other-hint">
            A second job, rent from a property, or profit from self-employment. Not savings interest or dividends.
          </span>
          <input id="other" name="otherIncome" type="number" inputMode="decimal" min={0} step={100} defaultValue={p.otherIncome ?? ''} aria-describedby="other-hint" />
        </div>
        <div className="field">
          <label htmlFor="children">Children you or your partner get Child Benefit for</label>
          <span className="hint" id="children-hint">
            Above £60,000, the higher earner at home pays some of it back. Pension contributions can bring that down.
          </span>
          <input id="children" name="childBenefitChildren" type="number" inputMode="numeric" min={0} max={20} step={1} defaultValue={p.childBenefitChildren ?? ''} aria-describedby="children-hint" />
        </div>
        <fieldset className="field">
          <legend>Do you earn more than your partner?</legend>
          <span className="hint">If your partner earns more, any Child Benefit charge falls on them. Choose yes if you don’t have a partner.</span>
          {radio('higherEarner', 'yes', 'Yes', p.higherEarner === true)}
          {radio('higherEarner', 'no', 'No', p.higherEarner === false)}
        </fieldset>
        <div className="field">
          <label htmlFor="otherpension">Paid into other pensions this tax year (£)</label>
          <span className="hint" id="otherpension-hint">
            A personal pension or another employer’s scheme, including tax relief. Leave empty for none.
          </span>
          <input id="otherpension" name="otherPensionSavings" type="number" inputMode="decimal" min={0} step={100} defaultValue={p.otherPensionSavings ?? ''} aria-describedby="otherpension-hint" />
        </div>
        <fieldset className="field">
          <legend>Have you taken money from a pension flexibly?</legend>
          <span className="hint">For example, cash from a pension pot or drawdown income. It lowers how much you can save into pensions each year.</span>
          {radio('flexiblyAccessed', 'yes', 'Yes', p.flexiblyAccessed === true)}
          {radio('flexiblyAccessed', 'no', 'No', p.flexiblyAccessed === false)}
        </fieldset>
        <button type="submit" className="fk-btn fk-primary">
          Save
        </button>
      </form>
      <h2>Delete my tax details</h2>
      <p>This deletes what you told Fork here. Anything from your payroll stays with payroll.</p>
      <form action={remove}>
        <button type="submit" className="fk-btn fk-secondary">
          Delete my tax details
        </button>
      </form>
    </section>
  );
}
