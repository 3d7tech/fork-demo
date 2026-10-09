import { recalculate, reexplain } from '@fork/pipeline';
import { asker, factsFor, loadScreen, saveScreen } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Rewrites and re-checks the words once the person has settled on new values. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { runId?: string; answers?: Record<string, string>; levers?: Record<string, number> } | null;
  const who = await asker();
  if (!who) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  const { subject, deps } = who;
  const screen = body?.runId ? loadScreen(subject, body.runId) : null;
  if (!screen) return Response.json({ error: 'That answer has expired. Ask again.' }, { status: 404 });
  try {
    const { facts, data } = await factsFor(deps, subject, screen);
    const r = recalculate(screen, facts, { answers: body?.answers, levers: body?.levers }, data);
    const answer = await reexplain(deps, screen, r);
    if (answer.kind === 'decision') saveScreen(subject, answer);
    return Response.json({ answer });
  } catch {
    return Response.json({ error: 'Those values are out of range.' }, { status: 400 });
  }
}
