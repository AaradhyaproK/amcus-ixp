// @ts-nocheck
// This is an example of a serverless function (e.g., /api/send-interview-link.ts)
// It should not be in your public/client-side code.

import * as Brevo from '@getbrevo/brevo';
import type { NextApiRequest, NextApiResponse } from 'next'; // Example for Next.js

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email, accessCode, interviewLink } = req.body;

  if (!email || !accessCode || !interviewLink) {
    return res.status(400).json({ message: 'Missing required fields: email, accessCode, interviewLink' });
  }

  // Configure Brevo API
  const apiInstance = new Brevo.TransactionalEmailsApi();
  apiInstance.setApiKey(
    Brevo.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY!
  );

  const sendSmtpEmail = new Brevo.SendSmtpEmail();

  sendSmtpEmail.subject = "Your Dsource Open Interview Link";
  sendSmtpEmail.htmlContent = `
    <html><body>
      <h1>Hello!</h1>
      <p>Here is your link to start the interview for Dsource.</p>
      <p><strong>Access Code:</strong> ${accessCode}</p>
      <p><a href="${interviewLink}?code=${accessCode}">Click here to open the interview</a></p>
      <p>Good luck!</p>
    </body></html>
  `;
  sendSmtpEmail.sender = { name: "Dsource", email: "noreply@yourdomain.com" }; // Use an email address you have verified with Brevo
  sendSmtpEmail.to = [{ email }];

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    res.status(200).json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Brevo API Error:', error);
    res.status(500).json({ message: 'Failed to send email' });
  }
}