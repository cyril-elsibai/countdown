import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'noreply@67numbers.com';

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
    subject: 'Verify your 6-7 Numbers account',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Verify your email</h2>
        <p>Click the button below to verify your account and start playing.</p>
        <a href="${verificationLink}" style="display: inline-block; background: #f5c842; color: #1a1a1a; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
          Verify my account
        </a>
        <p style="color: #888; font-size: 0.85rem; margin-top: 24px;">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
      </div>
    `,
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
    subject: 'Reset your 6-7 Numbers password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Reset your password</h2>
        <p>Click the button below to set a new password.</p>
        <a href="${resetLink}" style="display: inline-block; background: #f5c842; color: #1a1a1a; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
          Reset my password
        </a>
        <p style="color: #888; font-size: 0.85rem; margin-top: 24px;">This link expires in 1 hour. If you didn't request a reset, ignore this email.</p>
      </div>
    `,
  });
}
