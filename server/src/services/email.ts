import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY ?? 'dev-no-key');
const FROM = 'noreply@67numbers.com';
const LOGO_URL = 'https://www.67numbers.com/icon-192.png';

const emailWrapper = (content: string) => `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
    <div style="text-align: center; margin-bottom: 24px;">
      <img src="${LOGO_URL}" alt="6/7 Numbers" width="80" height="80" style="border-radius: 16px;" />
      <h1 style="font-size: 1.4rem; margin: 12px 0 0; color: #1a1a1a;">6/7 Numbers</h1>
    </div>
    ${content}
    <p style="color: #888; font-size: 0.8rem; margin-top: 32px; text-align: center;">67numbers.com</p>
  </div>
`;

export async function sendVerificationEmail(to: string, verificationLink: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log('\n========================================');
    console.log('EMAIL VERIFICATION LINK (dev mode):');
    console.log(verificationLink);
    console.log('========================================\n');
    return;
  }

  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Verify your 6/7 Numbers account',
    html: emailWrapper(`
      <h2 style="color: #1a1a1a;">Verify your email</h2>
      <p style="color: #333;">Click the button below to verify your account and start playing.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${verificationLink}" style="display: inline-block; background: #f5c842; color: #1a1a1a; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold;">
          Verify my account
        </a>
      </div>
      <p style="color: #888; font-size: 0.85rem;">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
    `),
  });
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.log('\n========================================');
    console.log('PASSWORD RESET LINK (dev mode):');
    console.log(resetLink);
    console.log('========================================\n');
    return;
  }

  await resend.emails.send({
    from: FROM,
    to,
    subject: 'Reset your 6/7 Numbers password',
    html: emailWrapper(`
      <h2 style="color: #1a1a1a;">Reset your password</h2>
      <p style="color: #333;">Click the button below to set a new password.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${resetLink}" style="display: inline-block; background: #f5c842; color: #1a1a1a; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold;">
          Reset my password
        </a>
      </div>
      <p style="color: #888; font-size: 0.85rem;">This link expires in 1 hour. If you didn't request a reset, ignore this email.</p>
    `),
  });
}
