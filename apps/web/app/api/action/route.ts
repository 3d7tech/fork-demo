import { schema } from '@fork/db';
import { FAMILIES, leverValues } from '@fork/pipeline';
import { createRequest, factRecord, saveDecision } from '@fork/setup';
import { eq } from 'drizzle-orm';
import { database } from '@/lib/db';
import { sendMail } from '@/lib/mail';
import { asker, factsFor, loadScreen } from '@/lib/server';
import { baseUrl } from '@/lib/viewer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The screen's primary action. Payroll changes and company plans go to the accountant as a
 * request; Fork never changes payroll itself. "Save" (and the save button on any screen) keeps
 * the decision and re-checks it when the person's pay or the rules change.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { runId?: string; save?: boolean } | null;
  const who = await asker();
  if (!who) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  const screen = body?.runId ? await loadScreen(who, body.runId) : null;
  if (!screen) return Response.json({ error: 'That answer has expired. Ask again.' }, { status: 404 });
  const family = FAMILIES[screen.family]!;
  const type = body?.save ? 'save' : (screen.spec.action?.type ?? 'save');

  if (who.viewer.mode === 'demo') {
    const next = type === 'payroll.request' || type === 'plan.send' ? 'Request ready for your accountant.' : 'Saved.';
    return Response.json({ message: `${next} (Demo: nothing was sent.)` });
  }
  const { ctx, companyName } = who.viewer;
  const { facts } = await factsFor(who.deps, who.subject, screen);
  const levers = leverValues(screen.spec, facts, screen.levers);

  if (type === 'save') {
    const headline = Object.fromEntries(screen.layout.outcomeTiles.flatMap((k) => (screen.calc.outputs[k] ? [[k, screen.calc.outputs[k]!.value]] : [])));
    await saveDecision(database(), ctx, screen.runId, screen.copy.title, { facts: factRecord(facts), rulePack: `${screen.calc.rulePack.id}@${screen.calc.rulePack.version}`, verdict: screen.calc.verdict, headline });
    return Response.json({ message: 'Saved. Fork will tell you if your pay or the rules change the answer. See it under My decisions.' });
  }

  // The accountant needs to know whose payroll to change; that is the employee's own record.
  let person: { name: string; payrollRef: string } | null = null;
  if (who.subject.employeeId) {
    const [e] = await database().asMember(ctx, (db) => db.select({ name: schema.employee.name, payrollRef: schema.employee.payrollRef }).from(schema.employee).where(eq(schema.employee.id, who.subject.employeeId!)));
    person = e ?? null;
  }
  const request = family.request?.({ calc: screen.calc, levers, answers: screen.answers, facts: factRecord(facts), person, companyName });
  if (!request) return Response.json({ message: 'There’s nothing to change yet. Move the slider to the level you want, then ask again.' });
  const sent = await createRequest(database(), ctx, { runId: screen.runId, kind: type === 'plan.send' ? 'plan.send' : 'payroll.request', family: family.id, summary: request.summary, figures: request.figures });
  for (const to of sent.accountants) {
    await sendMail({ to, subject: `New request from ${companyName}`, text: `${request.summary}\n\nSee it and update its status here:\n${await baseUrl()}/accountant` });
  }
  const privacy = who.subject.audience === 'employee' ? ' Your employer doesn’t see your request.' : '';
  return Response.json({
    message: sent.accountants.length
      ? `Sent to your accountant. They make the change; nothing changes until they do. Track it under My decisions.${privacy}`
      : `Saved as a request. ${companyName} hasn’t added an accountant to Fork yet, so it will go to them as soon as one joins.${privacy}`,
  });
}
