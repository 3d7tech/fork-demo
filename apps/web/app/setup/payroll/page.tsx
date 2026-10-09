import { requireOwner } from '@/lib/viewer';
import { uploadPayrollAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function PayrollUpload({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireOwner();
  const { error } = await searchParams;
  return (
    <section className="card" aria-labelledby="pu-title">
      <a href="/setup" className="back">
        ‹ Setup
      </a>
      <h1 id="pu-title">Upload your payroll export</h1>
      <p className="lead">A CSV or Excel file from your payroll software or accountant, with one row per person.</p>
      <ul className="small">
        <li>Needed: employee number, name, annual salary and contracted hours a week</li>
        <li>Helpful: work email (for invites), date of birth, pension contribution %, start date</li>
      </ul>
      {error && (
        <p className="notice warn" role="alert">
          {error}
        </p>
      )}
      <form action={uploadPayrollAction} className="form">
        <div className="field">
          <label htmlFor="file">Payroll file</label>
          <input id="file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </div>
        <button type="submit" className="fk-btn fk-primary">
          Upload
        </button>
      </form>
      <p className="small">Fork checks every row before saving anything. Pay details are visible to owners and to each person for their own record only.</p>
    </section>
  );
}
