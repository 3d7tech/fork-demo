import { recalculate, reexplain } from '@fork/pipeline';
import { currentSubject, factsFor, loadScreen, pipelineDeps, saveScreen } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Rewrites and re-checks the words once the person has settled on new values. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { runId?: string; answers?: Record<string, string>; levers?: Record<string, number> } | null;
  const subject = currentSubject();
  const screen = body?.runId ? loadScreen(subject, body.runId) : null;
  if (!screen) return Response.json({ error: 'That answer has expired. Ask again.' }, { status: 404 });
  try {
    const r = recalculate(screen, await factsFor(subject, screen), { answers: body?.answers, levers: body?.levers });
    const answer = await reexplain(pipelineDeps(), screen, r);
    if (answer.kind === 'decision') saveScreen(subject, answer);
    return Response.json({ answer });
  } catch {
    return Response.json({ error: 'Those values are out of range.' }, { status: 400 });
  }
}
