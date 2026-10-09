'use server';

import { createInvite, type RequestContext } from '@fork/db';
import { runRole } from '@fork/models';
import { importPayroll, listPeople, saveCompanySettings, saveScheme, UploadError, uploadPayroll, FIELD_IDS, type ColumnMatcher, type Mapping } from '@fork/setup';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { database, fileStore } from '@/lib/db';
import { sendMail } from '@/lib/mail';
import { DEMO, pipelineDeps } from '@/lib/server';
import { baseUrl, requireOwner } from '@/lib/viewer';

const num = (v: FormDataEntryValue | null) => (v === null || v === '' ? NaN : Number(v));

export async function saveSettingsAction(form: FormData) {
  const { ctx } = await requireOwner();
  const colour = String(form.get('brandColour') ?? '').trim();
  await saveCompanySettings(database(), ctx, {
    employerNiSharePct: num(form.get('employerNiSharePct')),
    employmentAllowance: form.get('employmentAllowance') === 'on',
    brandColour: colour || null,
  });
  redirect('/setup?saved=settings');
}

export async function saveSchemeAction(form: FormData) {
  const { ctx } = await requireOwner();
  await saveScheme(database(), ctx, {
    name: String(form.get('name') ?? ''),
    provider: String(form.get('provider') ?? '').trim() || null,
    reliefMethod: form.get('reliefMethod') === 'net_pay' ? 'net_pay' : 'relief_at_source',
    basis: form.get('basis') === 'qualifying_earnings' ? 'qualifying_earnings' : 'full_salary',
    employerPct: num(form.get('employerPct')),
    employeeDefaultPct: num(form.get('employeeDefaultPct')),
  });
  redirect('/setup?saved=scheme');
}

/** The column matcher model, unless the app is in demo mode (no key), where header words do the job. */
function matcher(): ColumnMatcher | undefined {
  if (DEMO) return undefined;
  return async (input) => (await runRole(pipelineDeps().roles, 'column_matcher', input)).output;
}

export async function uploadPayrollAction(form: FormData) {
  const { ctx } = await requireOwner();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) redirect('/setup/payroll?error=' + encodeURIComponent('Choose a file to upload.'));
  let id: string;
  try {
    const up = await uploadPayroll({ db: database(), files: fileStore(), matcher: matcher() }, ctx, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    id = up.uploadId;
  } catch (e) {
    if (e instanceof UploadError) redirect('/setup/payroll?error=' + encodeURIComponent(e.message));
    throw e;
  }
  redirect(`/setup/payroll/${id}`);
}

export async function importPayrollAction(form: FormData) {
  const { ctx } = await requireOwner();
  const id = String(form.get('uploadId'));
  const mapping: Mapping = {};
  for (const f of FIELD_IDS) mapping[f] = String(form.get(`map_${f}`) ?? '') || null;
  try {
    const r = await importPayroll({ db: database(), files: fileStore() }, ctx, id, mapping, String(form.get('periodEnd') ?? ''));
    if (r.ok) redirect(`/setup/team?imported=${r.people}&added=${r.added}`);
  } catch (e) {
    if (e instanceof UploadError) redirect(`/setup/payroll/${id}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath(`/setup/payroll/${id}`);
  redirect(`/setup/payroll/${id}?check=1`);
}

async function invite(ctx: RequestContext, companyName: string, email: string, role: 'owner' | 'employee', employeeId?: string) {
  const token = await createInvite(database(), ctx, { email, role, ...(employeeId ? { employeeId } : {}) });
  const link = `${await baseUrl()}/invite/${token}`;
  await sendMail({
    to: email,
    subject: role === 'employee' ? `${companyName} has set you up on Fork` : `Help set up Fork for ${companyName}`,
    text:
      role === 'employee'
        ? `${companyName} uses Fork to help you make decisions about your pay, pension and benefits, with your own numbers.\n\nWhat you ask Fork is private to you. ${companyName} never sees your questions, answers or decisions.\n\nJoin here (the link lasts 14 days):\n${link}`
        : `You’ve been invited to help set up Fork for ${companyName}.\n\nJoin here (the link lasts 14 days):\n${link}`,
  });
}

export async function inviteEmployeesAction(form: FormData) {
  const { ctx, companyName } = await requireOwner();
  const only = form.get('employeeId');
  const people = (await listPeople(database(), ctx)).filter((p) => p.email && p.status === 'not_invited' && (!only || p.id === only));
  for (const p of people) await invite(ctx, companyName, p.email!, 'employee', p.id);
  redirect(`/setup/team?invited=${people.length}`);
}

export async function inviteOwnerAction(form: FormData) {
  const { ctx, companyName } = await requireOwner();
  try {
    await invite(ctx, companyName, String(form.get('email') ?? ''), 'owner');
  } catch (e) {
    redirect('/setup/team?error=' + encodeURIComponent(e instanceof Error ? e.message : 'That invite didn’t work.'));
  }
  redirect('/setup/team?invited=1');
}
