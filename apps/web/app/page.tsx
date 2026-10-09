import { redirect } from 'next/navigation';
import { requireViewer } from '@/lib/viewer';
import { AskApp } from './AskApp';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const viewer = await requireViewer();
  // Owner decisions arrive in step 7; until then an owner's home is setup.
  if (viewer.role === 'owner') redirect('/setup');
  return <AskApp />;
}
