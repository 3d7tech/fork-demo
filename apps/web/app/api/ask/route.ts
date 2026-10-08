import { askFork } from '@fork/pipeline';
import { currentSubject, DEMO, pipelineDeps, saveScreen } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Streams building steps as they happen, then the answer, as newline-delimited JSON. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { question?: unknown } | null;
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 2000) : '';
  if (!question) return Response.json({ error: 'Ask a question first.' }, { status: 400 });

  const subject = currentSubject();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + '\n'));
      try {
        const answer = await askFork(pipelineDeps(), { question, subject, onStep: (step) => send({ type: 'step', step }) });
        if (answer.kind === 'decision') saveScreen(subject, answer);
        send({ type: 'answer', answer, demo: DEMO });
      } catch (error) {
        console.error(error);
        send({ type: 'error', message: 'Fork couldn’t work this one out just now. Try again in a moment.' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
