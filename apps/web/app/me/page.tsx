import { deleteMyQuestions } from '@fork/setup';
import { redirect } from 'next/navigation';
import { database } from '@/lib/db';
import { requireMember } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

async function deleteAll() {
  'use server';
  const { ctx } = await requireMember();
  const n = await deleteMyQuestions(database(), ctx);
  redirect(`/me?deleted=${n}`);
}

export default async function MyData({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requireMember();
  const { deleted } = await searchParams;
  return (
    <section className="card" aria-labelledby="me-title">
      <a href="/decisions" className="back">
        ‹ My decisions
      </a>
      <h1 id="me-title">Your data</h1>
      {deleted !== undefined && (
        <p className="notice" role="status">
          Deleted {deleted} questions and answers.
        </p>
      )}
      <p className="lead">Download everything Fork holds that is yours: your questions, Fork’s answers, decisions you saved and requests you sent.</p>
      <a className="fk-btn fk-secondary" href="/me/download" download>
        Download my data
      </a>
      <h2>Your tax details</h2>
      <p>Scottish tax, student loans, other income and Child Benefit change Fork’s numbers. Only you can see them.</p>
      <a className="fk-btn fk-secondary" href="/me/tax">
        See or change my tax details
      </a>
      <h2>Delete my questions</h2>
      <p>This deletes every question you asked and every answer Fork gave you, and the decisions you saved. Requests you sent stay with your accountant, because they may already be acting on them.</p>
      <form action={deleteAll}>
        <button type="submit" className="fk-btn fk-secondary">
          Delete my questions and answers
        </button>
      </form>
    </section>
  );
}
