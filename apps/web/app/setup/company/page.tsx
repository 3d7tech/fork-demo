import { readCompany } from '@fork/setup';
import { database } from '@/lib/db';
import { requireOwner } from '@/lib/viewer';
import { saveSettingsAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CompanySettingsPage() {
  const { ctx } = await requireOwner();
  const data = await readCompany(database(), ctx);
  const c = data!.company;
  return (
    <section className="card" aria-labelledby="co-title">
      <a href="/setup" className="back">
        ‹ Setup
      </a>
      <h1 id="co-title">Company settings</h1>
      <form action={saveSettingsAction} className="form">
        <div className="field">
          <label htmlFor="share">Share of your NI saving passed to staff pensions (%)</label>
          <span className="hint" id="share-hint">
            When someone switches to salary sacrifice, you pay less employer National Insurance. Many employers add some of that saving to the person’s pension.
          </span>
          <input id="share" name="employerNiSharePct" type="number" inputMode="decimal" min={0} max={100} step={1} defaultValue={Number(c.employerNiSharePct)} aria-describedby="share-hint" required />
        </div>
        <fieldset className="field">
          <legend>Employment Allowance</legend>
          <label className="choice">
            <input type="checkbox" name="employmentAllowance" defaultChecked={c.employmentAllowance} />
            <span>The company claims Employment Allowance</span>
          </label>
          <span className="hint">It reduces your employer NI bill each year, which changes how much salary sacrifice saves.</span>
        </fieldset>
        <div className="field">
          <label htmlFor="reenrol">Next re-enrolment date (optional)</label>
          <span className="hint" id="reenrol-hint">
            Every three years you re-enrol eligible staff into the pension. The Pensions Regulator writes to you with the date.
          </span>
          <input id="reenrol" name="reenrolmentDate" type="date" defaultValue={c.reenrolmentDate ?? ''} aria-describedby="reenrol-hint" />
        </div>
        <div className="field">
          <label htmlFor="colour">Brand colour (optional)</label>
          <span className="hint" id="colour-hint">
            A hex colour such as #1f3fa8, used for buttons. It must be dark enough to read white text on.
          </span>
          <input id="colour" name="brandColour" type="text" pattern="#[0-9a-fA-F]{6}" defaultValue={c.brandColour ?? ''} aria-describedby="colour-hint" />
        </div>
        <button type="submit" className="fk-btn fk-primary">
          Save
        </button>
      </form>
    </section>
  );
}
