import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

function createTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

/**
 * Send a password-reset link by email.
 *
 * In development (or when SMTP is not configured) the link is logged
 * to the console so the flow can be tested without a real mail server.
 *
 * @param to    Recipient email address
 * @param link  Full reset URL including the raw token as a query param
 */
export async function sendPasswordResetEmail(to: string, link: string): Promise<void> {
  const transporter = createTransporter();

  if (!transporter) {
    logger.warn({ to, link }, '[email] SMTP not configured — reset link logged instead of sent');
    return;
  }

  try {
    await transporter.sendMail({
      from: `"FamilyApp" <${env.SMTP_USER}>`,
      to,
      subject: 'Réinitialisation de votre mot de passe',
      text: `Bonjour,\n\nCliquez sur le lien ci-dessous pour réinitialiser votre mot de passe (valable 1 heure) :\n\n${link}\n\nSi vous n'avez pas fait cette demande, ignorez cet email.\n\nL'équipe FamilyApp`,
      html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#f9fafb;border-radius:12px">
        <h2 style="color:#111827;margin-bottom:8px">Réinitialisation du mot de passe</h2>
        <p style="color:#6b7280;margin-bottom:24px">
          Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
          Ce lien est valable <strong>1 heure</strong>.
        </p>
        <a href="${link}"
           style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          Réinitialiser mon mot de passe
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">
          Si vous n'avez pas demandé cette réinitialisation, ignorez cet email —
          votre mot de passe restera inchangé.
        </p>
      </div>`,
    });
    logger.info({ to }, '[email] Password-reset email sent');
  } catch (err) {
    // SMTP failure must never cause a 500 — log error + link so admins can act manually
    logger.error({ err, to, link }, '[email] Failed to send password-reset email — reset link logged');
  }
}
