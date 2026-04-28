import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Helper function to send notifications
// Use this for Recruiter Messages AND Job Status Updates
export const sendNotification = async (
  recipientId: string, 
  message: string, 
  type: 'message' | 'status_update' = 'message',
  senderId?: string,
  senderName?: string
) => {
  if (!recipientId) {
    console.error("Attempted to send notification without recipientId");
    throw new Error("Recipient ID is required");
  }
  try {
    await addDoc(collection(db, 'notifications'), {
      userId: recipientId,
      message,
      type,
      read: false,
      createdAt: serverTimestamp(),
      senderId: senderId || null,
      senderName: senderName || 'System'
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    throw error;
  }
};