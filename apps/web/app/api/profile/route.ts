import { saveTaxProfile, TaxProfileAnswers } from '@fork/setup';
import { database } from '@/lib/db';
import { getViewer } from '@/lib/viewer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Save the signed-in employee's own tax details (ADR 0010). Nobody can save anyone else's. */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.mode !== 'db' || viewer.role !== 'employee' || !viewer.subject.employeeId) return Response.json({ error: 'Sign in as an employee first.' }, { status: 401 });
  const parsed = TaxProfileAnswers.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Those answers don’t look right. Try again.' }, { status: 400 });
  await saveTaxProfile(database(), viewer.ctx, viewer.subject.employeeId, parsed.data);
  return Response.json({ ok: true });
}
