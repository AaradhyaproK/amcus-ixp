// WhatsApp Automation API Service
// API Endpoint: https://whatsapp-task-manager-ai4d.onrender.com/api/v1/send-message

const WHATSAPP_API_URL = import.meta.env.VITE_WHATSAPP_API_URL ;
const WHATSAPP_SESSION_ID = import.meta.env.VITE_WHATSAPP_SESSION_ID ;
const WHATSAPP_SESSION_PASSCODE = import.meta.env.VITE_WHATSAPP_SESSION_PASSCODE ;

export interface SendWhatsAppResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Robustly extracts a valid phone number (10 digits) from raw resume or document text.
 * Solves country-code prefix issues (e.g., +91, 1, 0) where numbers were extracted as 177... instead of 77...
 */
export function extractPhoneFromText(text: string): string {
  if (!text) return 'N/A';

  // 1. Look for Indian 10-digit mobile number [6-9]XXXXX XXXXX with optional leading country codes (+91, 91, 1, 0)
  const indianRegex = /(?:\+?91|\b91|\b1|\b0)?[\s.-]*\b([6-9]\d{4}[\s.-]?\d{5})\b/g;
  let match: RegExpExecArray | null;
  
  while ((match = indianRegex.exec(text)) !== null) {
    const raw = match[0].replace(/\D/g, '');
    if (raw.length >= 10) {
      const last10 = raw.slice(-10);
      if (/^[6-9]\d{9}$/.test(last10)) {
        return last10;
      }
    }
  }

  // 2. Direct 10-digit mobile number check anywhere in text (starts with 6, 7, 8, or 9)
  const direct10Match = text.match(/\b[6-9]\d{9}\b/);
  if (direct10Match) {
    return direct10Match[0];
  }

  // 3. Generic international 10-digit match fallback
  const genericMatch = text.match(/(?:\+?\d{1,3}[\s.-]?)?\(?(\d{3,4})\)?[\s.-]?(\d{3,4})[\s.-]?(\d{4})/);
  if (genericMatch) {
    const cleaned = genericMatch[0].replace(/\D/g, '');
    if (cleaned.length >= 10) {
      return cleaned.slice(-10);
    }
  }

  return 'N/A';
}

/**
 * Formats a phone number for the WhatsApp API.
 * Prepends +91 for 10-digit Indian numbers. Ensures + prefix is present.
 */
export function formatWhatsAppPhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (!cleaned) return '';
  
  // Standard 10-digit Indian mobile number auto-prefix with +91
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return `+91${cleaned.slice(1)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`;
  }
  if (!phone.startsWith('+')) {
    return `+${cleaned}`;
  }
  return phone.trim();
}

/**
 * Core API Call: Send a text message via WhatsApp Task Manager API
 */
export async function sendWhatsAppMessage(to: string, text: string): Promise<SendWhatsAppResponse> {
  const formattedPhone = formatWhatsAppPhone(to);
  if (!formattedPhone) {
    return { success: false, error: 'Invalid phone number provided.' };
  }

  console.log('[WhatsApp API] Sending message to:', formattedPhone);

  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': WHATSAPP_SESSION_ID,
        'x-session-passcode': WHATSAPP_SESSION_PASSCODE,
      },
      body: JSON.stringify({
        phone: formattedPhone,
        message: text,
      }),
    });

    const data = await response.json();
    console.log('[WhatsApp API] Response status:', response.status, '| Data:', data);

    if (!response.ok || data.success === false) {
      const errMsg = data?.message || data?.error || `WhatsApp API error ${response.status}`;
      return { success: false, data, error: errMsg };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error('[WhatsApp API] Network error:', err);
    return { success: false, error: err.message || 'Network error connecting to WhatsApp API' };
  }
}

/**
  * Helper to build and send an Interview Invite message via WhatsApp
  */
export async function sendWhatsAppInterviewInvite({
  phone,
  candidateName,
  jobTitle,
  interviewLink,
  accessCode,
}: {
  phone: string;
  candidateName?: string;
  jobTitle: string;
  interviewLink: string;
  accessCode: string;
}): Promise<SendWhatsAppResponse> {
  const greeting = candidateName ? `Dear ${candidateName},` : 'Hello 👋';
  const text = `${greeting}

We are excited to invite you for an interview for the position of *${jobTitle}* at DSource / Ampcus!

🚀 *Access your online interview here:*
${interviewLink}

🔑 *Your Interview Password / Access Code:*
${accessCode}

Please ensure you have a quiet environment and stable internet connection. If you face any issues, contact DSource Support at 9762588623 / 8484888632.

Best wishes,
*Team DSource Recruiting*`;

  return sendWhatsAppMessage(phone, text);
}

/**
  * Sends bulk WhatsApp interview invites to multiple candidate records
  */
export async function sendBulkWhatsAppInvitations(
  candidates: Array<{ phone?: string; name?: string; email?: string }>,
  jobTitle: string,
  interviewLink: string,
  accessCode: string
): Promise<{ successCount: number; failedCount: number; errors: string[] }> {
  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const cand of candidates) {
    if (!cand.phone || cand.phone === 'N/A') {
      continue;
    }

    const res = await sendWhatsAppInterviewInvite({
      phone: cand.phone,
      candidateName: cand.name || (cand.email ? cand.email.split('@')[0] : undefined),
      jobTitle,
      interviewLink,
      accessCode,
    });

    if (res.success) {
      successCount++;
    } else {
      failedCount++;
      if (res.error) errors.push(`${cand.phone || cand.email}: ${res.error}`);
    }
  }

  return { successCount, failedCount, errors };
}
