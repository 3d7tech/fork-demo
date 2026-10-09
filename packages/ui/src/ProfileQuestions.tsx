'use client';

import { useId, useState } from 'react';

export type ProfileQuestion = 'tax_region' | 'student_loans';
export type StudentLoanPlan = 'plan_1' | 'plan_2' | 'plan_4' | 'plan_5' | 'postgraduate';
export interface ProfileAnswers {
  taxRegion?: 'rest_of_uk' | 'scotland';
  studentLoans?: StudentLoanPlan[];
}

const PLANS: Array<[StudentLoanPlan, string]> = [
  ['plan_1', 'Plan 1'],
  ['plan_2', 'Plan 2'],
  ['plan_4', 'Plan 4 (Scotland)'],
  ['plan_5', 'Plan 5'],
  ['postgraduate', 'Postgraduate loan'],
];

/**
 * "A few details first": how the person is taxed, asked once before their first screen (ADR 0010).
 * Two tap-to-answer questions; nothing is assumed, and nothing is sent until both are answered.
 */
export function ProfileQuestions({ questions, busy, onSubmit }: { questions: ProfileQuestion[]; busy?: boolean; onSubmit: (a: ProfileAnswers) => void }) {
  const base = useId();
  const [region, setRegion] = useState<ProfileAnswers['taxRegion']>();
  const [loans, setLoans] = useState<StudentLoanPlan[] | undefined>();
  const askRegion = questions.includes('tax_region');
  const askLoans = questions.includes('student_loans');
  const ready = (!askRegion || region) && (!askLoans || loans);
  const toggle = (p: StudentLoanPlan) => setLoans((l) => (l?.includes(p) ? l.filter((x) => x !== p) : [...(l ?? []), p]));

  return (
    <form
      className="fk-profile"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit({ ...(askRegion ? { taxRegion: region } : {}), ...(askLoans ? { studentLoans: loans } : {}) });
      }}
    >
      {askRegion && (
        <div className="fk-ask" role="group" aria-labelledby={`${base}-region`} aria-describedby={`${base}-region-hint`}>
          <p id={`${base}-region`}>Do you pay Scottish income tax?</p>
          <p id={`${base}-region-hint`} className="fk-note">
            If you do, the tax code on your payslip starts with S.
          </p>
          <div className="fk-pills">
            <button type="button" aria-pressed={region === 'scotland'} onClick={() => setRegion('scotland')}>
              Yes
            </button>
            <button type="button" aria-pressed={region === 'rest_of_uk'} onClick={() => setRegion('rest_of_uk')}>
              No
            </button>
          </div>
        </div>
      )}
      {askLoans && (
        <div className="fk-ask" role="group" aria-labelledby={`${base}-loans`} aria-describedby={`${base}-loans-hint`}>
          <p id={`${base}-loans`}>Do you repay a student loan through your pay?</p>
          <p id={`${base}-loans-hint`} className="fk-note">
            Your payslip shows it as student loan or SL. Choose every plan you repay; a payslip or the Student Loans Company will tell you which.
          </p>
          <div className="fk-pills">
            <button type="button" aria-pressed={loans?.length === 0} onClick={() => setLoans([])}>
              No
            </button>
            {PLANS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={!!loans?.includes(id)} onClick={() => toggle(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <button type="submit" className="fk-btn fk-primary" disabled={!ready || busy}>
        {busy ? 'Saving…' : 'Save and see my answer'}
      </button>
    </form>
  );
}
