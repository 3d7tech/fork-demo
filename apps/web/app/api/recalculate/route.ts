import { recalculate } from '@fork/pipeline';
import { currentSubject, factsFor, loadScreen } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Re-runs the numbers for new lever values or answers. Code only, no models. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { runId?: string; answers?: Record<string, string>; levers?: Record<string, number> } | null;
  const subject = currentSubject();
  const screen = body?.runId ? loadScreen(subject, body.runId) : null;
  if (!screen) return Response.json({ error: 'That answer has expired. Ask again.' }, { status: 404 });
  try {
    const r = recalculate(screen, await factsFor(subject, screen), { answers: body?.answers, levers: body?.levers });
    return Response.json({ answers: r.answers, levers: r.levers, calc: r.calc, numbers: r.numbers, visual: r.visual });
  } catch {
    return Response.json({ error: 'Those values are out of range.' }, { status: 400 });
  }
}
