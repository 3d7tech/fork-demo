import { exportMyData } from '@fork/setup';
import { database } from '@/lib/db';
import { getViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const viewer = await getViewer();
  if (!viewer || viewer.mode !== 'db' || viewer.role === 'accountant') return new Response('Sign in first.', { status: 401 });
  const data = await exportMyData(database(), viewer.ctx);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="my-fork-data.json"', 'cache-control': 'no-store' },
  });
}
