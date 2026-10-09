import { redirect } from 'next/navigation';
import { setupProgress } from '@fork/setup';
import { database } from '@/lib/db';
import { requireViewer } from '@/lib/viewer';
import { AskApp, OWNER_SUGGESTIONS } from './AskApp';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const viewer = await requireViewer();
  if (viewer.role === 'owner') {
    // Until payroll is in, an owner's first stop is setup.
    if (viewer.mode === 'db' && !(await setupProgress(database(), viewer.ctx)).payrollImports) redirect('/setup');
    return <AskApp suggestions={OWNER_SUGGESTIONS} canSave />;
  }
  if (viewer.role === 'accountant') redirect('/accountant');
  return <AskApp canSave={viewer.mode === 'db'} />;
}
