'use server';

import { completeSignIn, requestSignIn } from '@fork/db';
import { redirect } from 'next/navigation';
import { database } from '@/lib/db';
import { sendMail } from '@/lib/mail';
import { baseUrl, setSessionCookie } from '@/lib/viewer';

export async function sendSignInLink(form: FormData) {
  const email = String(form.get('email') ?? '').slice(0, 320);
  const token = await requestSignIn(database(), email);
  if (token) {
    await sendMail({
      to: email.trim(),
      subject: 'Your Fork sign-in link',
      text: `Here’s your link to sign in to Fork. It works once and lasts 15 minutes.\n\n${await baseUrl()}/auth/link?token=${token}\n\nIf you didn’t ask for this, you can ignore this email.`,
    });
  }
  // The same reply either way, so this page can't be used to check who has an account.
  redirect('/signin?sent=1');
}

export async function signInWithLink(form: FormData) {
  const session = await completeSignIn(database(), String(form.get('token') ?? ''));
  if (!session) redirect('/signin?expired=1');
  await setSessionCookie(session);
  redirect('/');
}
