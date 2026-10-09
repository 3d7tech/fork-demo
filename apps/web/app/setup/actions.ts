'use server';

import { createInvite, type RequestContext } from '@fork/db';
import { runRole } from '@fork/models';
import {
  confirmAllFacts,
  confirmFact,
  importPayroll,
  listPeople,
  removeFact,
  saveCompanySettings,
  saveScheme,
  UploadError,
  uploadDocument,
  uploadPayroll,
  FIELD_IDS,
  type ColumnMatcher,
  type DocumentInterpreter,
  type DocumentKind,
  type Mapping,
} from '@fork/setup';
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
    reenrolmentDate: String(form.get('reenrolmentDate') ?? '') || null,
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

async function invite(ctx: RequestContext, companyName: string, email: string, role: 'owner' | 'employee' | 'accountant', employeeId?: string) {
  const token = await createInvite(database(), ctx, { email, role, ...(employeeId ? { employeeId } : {}) });
  const link = `${await baseUrl()}/invite/${token}`;
  await sendMail({
    to: email,
    subject: role === 'employee' ? `${companyName} has set you up on Fork` : role === 'accountant' ? `${companyName} would like you to handle their Fork requests` : `Help set up Fork for ${companyName}`,
    text:
      role === 'employee'
        ? `${companyName} uses Fork to help you make decisions about your pay, pension and benefits, with your own numbers.\n\nWhat you ask Fork is private to you. ${companyName} never sees your questions, answers or decisions.\n\nJoin here (the link lasts 14 days):\n${link}`
        : role === 'accountant'
          ? `${companyName} uses Fork to help staff with pay, pension and benefit decisions. When someone decides to change something, such as switching to salary sacrifice, Fork sends you a clear request and you update its status. Fork never changes payroll itself.\n\nJoin here (the link lasts 14 days):\n${link}`
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
    await invite(ctx, companyName, String(form.get('email') ?? ''), form.get('role') === 'accountant' ? 'accountant' : 'owner');
  } catch (e) {
    redirect('/setup/team?error=' + encodeURIComponent(e instanceof Error ? e.message : 'That invite didn’t work.'));
  }
  redirect('/setup/team?invited=1');
}

function interpreter(): DocumentInterpreter | undefined {
  if (DEMO) return undefined;
  return async (input, document) => (await runRole(pipelineDeps().roles, 'document_interpreter', input, { document })).output;
}

const KINDS: DocumentKind[] = ['handbook', 'pension_scheme', 'benefit_terms', 'other'];

export async function uploadDocumentAction(form: FormData) {
  const { ctx } = await requireOwner();
  const file = form.get('file');
  const kind = KINDS.find((k) => k === form.get('kind'));
  if (!(file instanceof File) || file.size === 0 || !kind) redirect('/setup/documents?error=' + encodeURIComponent('Choose what the document is and a file to upload.'));
  let id: string;
  try {
    const r = await uploadDocument({ db: database(), files: fileStore(), interpreter: interpreter() }, ctx, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), kind });
    id = r.documentId;
  } catch (e) {
    if (e instanceof UploadError) redirect('/setup/documents?error=' + encodeURIComponent(e.message));
    throw e;
  }
  redirect(`/setup/documents/${id}`);
}

export async function factAction(form: FormData) {
  const { ctx } = await requireOwner();
  const doc = String(form.get('documentId'));
  const fact = String(form.get('factId') ?? '');
  const op = form.get('op');
  try {
    if (op === 'confirm_all') await confirmAllFacts(database(), ctx, doc);
    else if (op === 'remove') await removeFact(database(), ctx, fact);
    else if (op === 'confirm') {
      const corrected = form.get('value');
      await confirmFact(database(), ctx, fact, typeof corrected === 'string' && corrected.trim() !== '' && form.get('changed') === '1' ? corrected : undefined);
    }
  } catch (e) {
    if (e instanceof UploadError) redirect(`/setup/documents/${doc}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  redirect(`/setup/documents/${doc}`);
}
