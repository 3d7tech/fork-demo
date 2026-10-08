import { currentSubject, DEMO, loadScreen } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The screen's primary action. Sending requests to the accountant, with status tracking and an
 * audit log, is step 8; until then this confirms what will happen and changes nothing.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { runId?: string } | null;
  const screen = body?.runId ? loadScreen(currentSubject(), body.runId) : null;
  if (!screen) return Response.json({ error: 'That answer has expired. Ask again.' }, { status: 404 });
  const next =
    screen.spec.action?.type === 'payroll.request'
      ? 'Request ready for your accountant. They make the change in payroll and your contract; nothing changes until they do. Your employer sees that someone switched, not who or why.'
      : 'Saved. Fork will tell you if your pay or the rules change the answer.';
  return Response.json({ message: DEMO ? `${next} (Demo: nothing was sent.)` : next });
}
