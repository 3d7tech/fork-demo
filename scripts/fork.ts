// Operator commands, run by 3d7 (not reachable from the web app).
//   pnpm fork create-company "Larkfield Analytics" maya@larkfield.test
//   pnpm fork seed-demo       Larkfield with Maya as owner, on the local database
import { sql } from 'drizzle-orm';
import { schema as s, asAdmin } from '../packages/db/src';
import { localUrl } from '../packages/db/src/local';

const adminUrl = process.env.FORK_DATABASE_ADMIN_URL ?? localUrl('fork');
const [command, ...args] = process.argv.slice(2);

async function createCompany(name: string, ownerEmail: string) {
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail ?? '')) throw new Error('Usage: pnpm fork create-company "<name>" <owner email>');
  return asAdmin(adminUrl, async (db) => {
    const [company] = await db.insert(s.company).values({ name }).returning();
    const email = ownerEmail.trim().toLowerCase();
    const [existing] = await db.select().from(s.appUser).where(eqEmail(email));
    const user = existing ?? (await db.insert(s.appUser).values({ email }).returning())[0];
    await db.insert(s.membership).values({ userId: user!.id, companyId: company!.id, role: 'owner' });
    await db.insert(s.auditEvent).values({ companyId: company!.id, action: 'company.created', detail: { by: 'operator' } });
    return company!;
  });
}

const eqEmail = (email: string) => sql`lower(${s.appUser.email}) = ${email}`;

if (command === 'create-company') {
  const c = await createCompany(args[0] ?? '', args[1] ?? '');
  console.log(`Created ${c.name} (${c.id}). The owner can sign in with their email.`);
} else if (command === 'seed-demo') {
  const c = await createCompany('Larkfield Analytics', 'maya@larkfield.test');
  console.log(`Created ${c.name}. Sign in as maya@larkfield.test; upload packages/setup/fixtures/larkfield-payroll.csv.`);
} else {
  console.error('Usage: pnpm fork create-company "<name>" <owner email> | seed-demo');
  process.exit(1);
}
