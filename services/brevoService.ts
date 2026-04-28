// Brevo Transactional Email Service
// Uses Brevo REST API v3 to send interview invitation emails

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_API_KEY = import.meta.env.VITE_BREVO_API_KEY;
const SENDER_EMAIL = import.meta.env.VITE_BREVO_SENDER_EMAIL;
const SENDER_NAME = import.meta.env.VITE_BREVO_SENDER_NAME || 'Dsource';

/**
 * Derives a human-readable name from an email address.
 * e.g., "john.doe@gmail.com" → "John Doe"
 */
function deriveNameFromEmail(email: string): string {
  const localPart = email.split('@')[0];
  return localPart
    .replace(/[0-9]/g, '') // Strip numbers (e.g. 2004)
    .replace(/[._-]/g, ' ') // Replace dots, dashes, underscores with space
    .split(' ')
    .filter(word => word.length > 0) // Remove any empty strings from multiple symbols
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

/**
 * Generates a plain and professional HTML email template for interview invitations.
 */
function getEmailTemplate(candidateName: string, jobTitle: string, interviewLink: string, accessCode: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview Invitation</title>
</head>
<body style="margin:0;padding:40px;background-color:#f4f6f9;font-family:Arial,sans-serif;color:#000000;font-size:16px;line-height:1.5;">
  <div style="max-width:650px;margin:0 auto;background-color:#daf2ef;box-shadow:0 8px 30px rgba(0,0,0,0.12);border-top:6px solid #0082c8;">
    
    <!-- Branding Header -->
    <div style="background-color:#ffffff;padding:25px 40px;text-align:left;border-bottom:1px solid #cfdad8;">
      <img src="https://res.cloudinary.com/dvzxfbcsd/image/upload/v1776428916/vwjnuvbd0lpwfrcch7kw.png" alt="DSource: Source -> Train -> Hire -> Retain" style="max-height:55px;width:auto;display:block;" />
    </div>

    <!-- Email Body -->
    <div style="padding:40px;">
      <p style="margin:0 0 30px;">Subject: Your Interview Confirmation</p>

      <p style="margin:0 0 20px;">Dear ${candidateName},</p>
      
      <p style="margin:0 0 20px;">We have found your resume suitable for the post ${jobTitle}.<br>If interested please attend the work interview. Please take this email as confirmation of the following details for your upcoming online interview.</p>
      
      <p style="margin:0 0 4px;"><strong>Interview Link:</strong> <a href="${interviewLink}" style="color:#0082c8;">${interviewLink}</a></p>
      <p style="margin:0 0 20px;"><strong>Interview Password:</strong> ${accessCode}</p>
      
      <p style="margin:0 0 20px;">Incase of any difficultly call DSource Support: 9762588623 / 8484888632</p>

      <p style="margin:0 0 30px;">In the meantime, we'll look forward to meeting you!</p>

      <p style="margin:0 0 20px;">Best wishes,</p>

      <p style="margin:0 0 4px;font-weight:bold;">Team DSource</p>
      <p style="margin:0;">Recruiting Manager</p>
    </div>
  </div>
</body>
</html>`;
}

export interface SendEmailResult {
  success: boolean;
  totalEmails: number;
  messageIds?: string[];
  error?: string;
}

/**
 * Core function: sends a single email via Brevo REST API.
 * Uses the simple, documented POST /v3/smtp/email format:
 * { sender, to, subject, htmlContent }
 */
async function sendSingleEmail(
  recipientEmail: string,
  recipientName: string,
  subject: string,
  htmlContent: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!BREVO_API_KEY) {
    console.error('[Brevo] API key is missing. Check VITE_BREVO_API_KEY in .env');
    return { success: false, error: 'Brevo API key is not configured.' };
  }
  if (!SENDER_EMAIL) {
    console.error('[Brevo] Sender email is missing. Check VITE_BREVO_SENDER_EMAIL in .env');
    return { success: false, error: 'Brevo sender email is not configured.' };
  }

  const payload = {
    sender: { email: SENDER_EMAIL, name: SENDER_NAME },
    to: [{ email: recipientEmail, name: recipientName }],
    subject: subject,
    htmlContent: htmlContent,
  };

  console.log('[Brevo] Sending email to:', recipientEmail, '| Subject:', subject);

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log('[Brevo] Response status:', response.status, '| Data:', JSON.stringify(data));

    if (!response.ok) {
      const errorMsg = data.message || `Brevo API returned ${response.status}`;
      console.error('[Brevo] API Error:', errorMsg, data);
      return { success: false, error: errorMsg };
    }

    console.log('[Brevo] ✅ Email sent successfully! MessageId:', data.messageId);
    return { success: true, messageId: data.messageId };
  } catch (err: any) {
    console.error('[Brevo] Network/fetch error:', err);
    return { success: false, error: err.message || 'Network error sending email' };
  }
}

/**
 * Sends interview invitation emails to a list of candidate emails.
 * Sends one email per candidate for maximum reliability.
 */
export async function sendInterviewInvitations(
  candidateEmails: string[],
  jobTitle: string,
  interviewLink: string,
  accessCode: string
): Promise<SendEmailResult> {
  if (!candidateEmails.length) {
    return { success: false, totalEmails: 0, error: 'No candidate emails provided.' };
  }

  const allMessageIds: string[] = [];
  let lastError = '';

  for (const email of candidateEmails) {
    const candidateName = deriveNameFromEmail(email);
    const htmlContent = getEmailTemplate(candidateName, jobTitle, interviewLink, accessCode);
    const subject = `Interview Invitation — ${jobTitle} | Dsource`;

    const result = await sendSingleEmail(email, candidateName, subject, htmlContent);

    if (result.success && result.messageId) {
      allMessageIds.push(result.messageId);
    } else {
      lastError = result.error || 'Unknown error';
    }
  }

  if (allMessageIds.length > 0) {
    return {
      success: true,
      totalEmails: allMessageIds.length,
      messageIds: allMessageIds,
      error: lastError || undefined,
    };
  }

  return { success: false, totalEmails: 0, error: lastError || 'Failed to send emails.' };
}
