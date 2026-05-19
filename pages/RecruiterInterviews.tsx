import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc, arrayUnion, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Interview } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';
import { useMessageBox } from '../components/MessageBox';
import { createPortal } from 'react-dom';
import { sendInterviewInvitations } from '../services/brevoService';
import EditJobModal from './EditJob';

import { evaluateResumeMatch } from '../services/api';

// Setup PDF.js worker to enable PDF parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const RecruiterInterviews: React.FC = () => {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<Interview | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [newEmails, setNewEmails] = useState<string[]>([]);
  const [parsedCandidates, setParsedCandidates] = useState<{email: string, phone: string, matchScore?: string}[]>([]);
  const [submissionsMap, setSubmissionsMap] = useState<Record<string, any[]>>({});
  const [parsingResumes, setParsingResumes] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [editingCandidateEmail, setEditingCandidateEmail] = useState<string | null>(null);
  const [editedEmailValue, setEditedEmailValue] = useState('');
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [remindingInterviewId, setRemindingInterviewId] = useState<string | null>(null);
  const [whatsappModal, setWhatsappModal] = useState<{
      isOpen: boolean;
      email: string;
      phone: string;
      message: string;
      interview: Interview;
  } | null>(null);
  const messageBox = useMessageBox();
  const navigate = useNavigate();
  const actionButtonClass = 'inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1a1a1a] text-gray-700 dark:text-gray-200 text-xs font-semibold hover:bg-white dark:hover:bg-gray-800 transition-colors';

  useEffect(() => {
    if (!user) {
        setLoading(false);
        return;
    };

    setLoading(true);
    const interviewsQuery = query(
      collection(db, 'interviews'),
      where('recruiterUID', '==', user.uid)
    );

    const unsubscribe = onSnapshot(interviewsQuery, async (querySnapshot) => {
      const interviewsData = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Interview))
        .filter(interview => interview.isMock !== true)
        .sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
          return timeB - timeA;
        });
      setInterviews(interviewsData);
      
      const newSubmissionsMap: Record<string, any[]> = {};
      for (const interview of interviewsData) {
         try {
             const qs = await getDocs(collection(db, 'interviews', interview.id, 'attempts'));
             newSubmissionsMap[interview.id] = qs.docs.map(d => d.data());
         } catch (e) {
             console.error("Error fetching submissions for", interview.id, e);
             newSubmissionsMap[interview.id] = [];
         }
      }
      setSubmissionsMap(newSubmissionsMap);
      setLoading(false);
    }, (err) => {
        console.error("Error fetching interviews:", err);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleDelete = (interviewId: string) => {
    messageBox.showConfirm("Are you sure you want to delete this interview?", async () => {
      try {
        await deleteDoc(doc(db, 'interviews', interviewId));
      } catch (err) {
        messageBox.showError("Error deleting interview");
      }
    });
  };

  const openInviteModal = (interview: Interview) => {
    setSelectedInterview(interview);
    setIsInviteModalOpen(true);
  };

  const handleRemoveNewEmail = (emailToRemove: string) => {
      setNewEmails(newEmails.filter(email => email !== emailToRemove));
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setParsingResumes(true);
    const newCandidatesFound: {email: string, phone: string, matchScore?: string}[] = [];
    let filesProcessed = 0;
    let filesWithErrors = 0;

    const parsePromises = Array.from(files).map(async (file) => {
      let text = '';
      try {
        if (file.type === 'application/pdf') {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            text += textContent.items.map((item: any) => item.str).join(' ');
          }
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          text = result.value;
        } else if (file.type === 'text/plain') {
          text = await file.text();
        } else {
          return; // Skip unsupported file types
        }

        const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
        const phoneMatch = text.match(/(?:\+?\d{1,4}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/);

        if (emailMatch) {
            const lowerEmail = emailMatch[1].toLowerCase();
            const phone = phoneMatch ? phoneMatch[0] : 'N/A';
            
            // Check if not already invited/added
            // We use functional updates later, but for the map function, we check against the current state array.
            if (!(selectedInterview?.candidateEmails || []).includes(lowerEmail) && !newEmails.includes(lowerEmail)) {
                
                // Fetch AI match score
                let matchScore = "N/A";
                if (selectedInterview && text.length > 50) {
                    try {
                        matchScore = await evaluateResumeMatch(selectedInterview.title, selectedInterview.description, text);
                    } catch (e) {
                        console.error('Match score error:', e);
                    }
                }
                
                // Ensure thread-safety for pushing to array
                if (!newCandidatesFound.some(c => c.email === lowerEmail)) {
                    newCandidatesFound.push({ email: lowerEmail, phone, matchScore });
                }
            }
        }
        filesProcessed++;
      } catch (error) {
        console.error(`Error parsing ${file.name}:`, error);
        filesWithErrors++;
      }
    });

    await Promise.all(parsePromises);

    if (newCandidatesFound.length > 0) {
        setNewEmails(prev => [...prev, ...newCandidatesFound.map(c => c.email)]);
        setParsedCandidates(prev => [...prev, ...newCandidatesFound]);
    }
    
    messageBox.showInfo(`Processed ${filesProcessed} file(s). Found ${newCandidatesFound.length} new candidate(s). ${filesWithErrors > 0 ? `Failed to parse ${filesWithErrors} file(s).` : ''}`);
    setParsingResumes(false);
    e.target.value = ''; // Reset file input
  };

  const handleEditAndResend = async (oldEmail: string, newEmail: string) => {
    if (!selectedInterview || !newEmail || oldEmail === newEmail) {
        setEditingCandidateEmail(null);
        return;
    }
    
    setResendingEmail(oldEmail);
    try {
        const updatedEmails = (selectedInterview.candidateEmails || []).filter(e => e.toLowerCase() !== oldEmail.toLowerCase());
        updatedEmails.push(newEmail.toLowerCase());

        await updateDoc(doc(db, 'interviews', selectedInterview.id), { 
            candidateEmails: updatedEmails
        });
        
        setSelectedInterview({...selectedInterview, candidateEmails: updatedEmails});
        
        const result = await sendInterviewInvitations(
            [newEmail],
            selectedInterview.title,
            selectedInterview.interviewLink || '',
            selectedInterview.accessCode
        );

        if (result.success) {
            messageBox.showSuccess(`Email updated and invitation resent to ${newEmail}!`);
        } else {
            messageBox.showError(`Failed to resend email: ${result.error}`);
        }
    } catch (error: any) {
        console.error('Edit & Resend error:', error);
        messageBox.showError('Failed to update and resend invitation.');
    } finally {
        setResendingEmail(null);
        setEditingCandidateEmail(null);
    }
  };

  const handleResend = async (email: string) => {
    if (!selectedInterview) return;
    setResendingEmail(email);
    try {
        const result = await sendInterviewInvitations(
            [email],
            selectedInterview.title,
            selectedInterview.interviewLink || '',
            selectedInterview.accessCode
        );

        if (result.success) {
            messageBox.showSuccess(`Invitation resent to ${email}!`);
        } else {
            messageBox.showError(`Failed to resend email: ${result.error}`);
        }
    } catch (error: any) {
        console.error('Resend error:', error);
        messageBox.showError('Failed to resend invitation.');
    } finally {
        setResendingEmail(null);
    }
  };

  const handleSendBulkReminders = async (interview: Interview) => {
    const explicitEmails = (interview.candidateEmails || []).map(e => e.toLowerCase());
    const submissions = submissionsMap[interview.id] || [];
    const pendingEmails = explicitEmails.filter(email => {
        return !submissions.some(sub => (sub.candidateInfo?.email || '').toLowerCase() === email);
    });

    if (pendingEmails.length === 0) {
        messageBox.showInfo('No pending candidates found. Everyone invited has already submitted.');
        return;
    }

    setRemindingInterviewId(interview.id);
    try {
        const result = await sendInterviewInvitations(
            pendingEmails,
            interview.title,
            interview.interviewLink || '',
            interview.accessCode,
            true
        );

        if (result.success) {
            messageBox.showSuccess(`Reminders sent successfully to ${result.totalEmails} candidate(s)!`);
        } else {
            messageBox.showError(`Failed to send some reminders: ${result.error}`);
        }
    } catch (error: any) {
        console.error('Bulk remind error:', error);
        messageBox.showError('Failed to send reminders.');
    } finally {
        setRemindingInterviewId(null);
    }
  };

  const handleSendInvites = async () => {
    if (!selectedInterview || newEmails.length === 0) return;
    
    setSendingEmails(true);
    try {
        const candidateDataToAdd = newEmails.map(email => {
            const parsed = parsedCandidates.find(c => c.email.toLowerCase() === email.toLowerCase());
            return {
                email: email.toLowerCase(),
                phone: parsed?.phone || 'N/A',
                matchScore: parsed?.matchScore || 'N/A'
            };
        });

        await updateDoc(doc(db, 'interviews', selectedInterview.id), { 
            candidateEmails: arrayUnion(...newEmails),
            candidateData: arrayUnion(...candidateDataToAdd)
        });
        
        const result = await sendInterviewInvitations(
            newEmails,
            selectedInterview.title,
            selectedInterview.interviewLink || '',
            selectedInterview.accessCode
        );

        if (result.success) {
            messageBox.showSuccess(`Successfully sent ${result.totalEmails} invitation(s)!`);
            setIsInviteModalOpen(false);
            setSelectedInterview(null);
            setNewEmails([]);
        } else {
            messageBox.showError(`Failed to send emails: ${result.error}`);
        }
    } catch (error: any) {
        console.error('Invite sending error:', error);
        messageBox.showError('Failed to send invitations.');
    } finally {
        setSendingEmails(false);
    }
  };


  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b border-gray-200 dark:border-white/5">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">My Interviews</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage all your scheduled interviews.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/recruiter/invites" className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 font-semibold rounded-full shadow-sm transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-sm">
            <i className="fas fa-address-book text-blue-500"></i> <span>Candidate Hub</span>
          </Link>
          <Link to="/recruiter/interview/create" className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white dark:text-black font-semibold rounded-full shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 text-sm">
            <i className="fas fa-plus"></i> <span>Create New Interview</span>
          </Link>
        </div>
      </div>

      {interviews.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 border-dashed">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-500">
                <i className="fas fa-video text-2xl"></i>
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-6">You haven't created any interviews yet.</p>
            <Link to="/recruiter/interview/create" className="text-primary font-medium hover:underline hover:text-primary-light transition-colors">Create your first interview</Link>
        </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {interviews.map(interview => (
                <div key={interview.id} className="bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm p-6 flex flex-col">
                    <div className="flex-grow">
                        <div className="flex flex-col gap-4 mb-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{interview.title}</h3>
                                <p className="text-sm text-gray-500">{interview.department}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                <Link
                                    to={`/recruiter/interview/responses/${interview.id}`}
                                    className={actionButtonClass}
                                    title="View Responses"
                                >
                                    <i className="fas fa-eye text-blue-500"></i>
                                    <span>View Responses</span>
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => openInviteModal(interview)}
                                    className={actionButtonClass}
                                    title="Invite Candidates"
                                >
                                    <i className="fas fa-user-plus text-green-500"></i>
                                    <span>Invite Candidates</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSendBulkReminders(interview)}
                                    className={actionButtonClass}
                                    title="Send Reminders"
                                    disabled={remindingInterviewId === interview.id}
                                >
                                    {remindingInterviewId === interview.id ? <i className="fas fa-spinner fa-spin text-purple-500"></i> : <i className="fas fa-bell text-purple-500"></i>}
                                    <span>Send Reminders</span>
                                </button>
                                <Link
                                    to={`/interview/${interview.id}`}
                                    target="_blank"
                                    className={actionButtonClass}
                                    title="Open Interview"
                                >
                                    <i className="fas fa-external-link-alt text-gray-500 dark:text-gray-300"></i>
                                    <span>Open Interview</span>
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => setEditingJobId(interview.id)}
                                    className={actionButtonClass}
                                    title="Edit Interview"
                                >
                                    <i className="fas fa-pencil-alt text-amber-500"></i>
                                    <span>Edit Interview</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(interview.id)}
                                    className={`${actionButtonClass} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40`}
                                    title="Delete Interview"
                                >
                                    <i className="fas fa-trash"></i>
                                    <span>Delete Interview</span>
                                </button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{interview.description}</p>
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/10">
                            <h4 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white flex items-center justify-between">
                                Candidates
                                <span className={submissionsMap[interview.id]?.length > 0 ? "text-green-600 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-full text-xs" : "text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full text-xs"}>
                                    {submissionsMap[interview.id]?.length || 0} Responses
                                </span>
                            </h4>
                            <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                                {(() => {
                                    const explicitEmails = (interview.candidateEmails || []).map(e => e.toLowerCase());
                                    const submissions = submissionsMap[interview.id] || [];
                                    const unifiedList: {email: string, hasSubmitted: boolean}[] = [];
                                    
                                    // 1. Add all actual submissions (invited or uninvited)
                                    submissions.forEach(sub => {
                                        unifiedList.push({ email: sub.candidateInfo?.email || 'N/A', hasSubmitted: true });
                                    });

                                    // 2. Add explicitly invited members who haven't submitted yet
                                    explicitEmails.forEach(email => {
                                        const hasSubmitted = submissions.some(sub => (sub.candidateInfo?.email || '').toLowerCase() === email);
                                        if (!hasSubmitted && !unifiedList.some(u => u.email.toLowerCase() === email)) {
                                            unifiedList.push({ email, hasSubmitted: false });
                                        }
                                    });

                                    if (unifiedList.length === 0) {
                                        return <p className="text-xs text-gray-500 italic block">No candidates invited or responses received yet.</p>;
                                    }

                                    return unifiedList.map((cand, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-[#1a1a1a] text-xs rounded-lg px-3 py-2 border border-gray-100 dark:border-white/5">
                                            <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[180px]" title={cand.email}>{cand.email}</span>
                                            {cand.hasSubmitted ? (
                                                <span className="text-green-600 dark:text-green-400 font-semibold flex items-center gap-1.5 shrink-0">
                                                    <i className="fas fa-check-circle"></i> Submitted
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-yellow-600 dark:text-yellow-500 font-medium flex items-center gap-1.5">
                                                        <i className="fas fa-clock"></i> Pending
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const candData = (interview as any).candidateData?.find((c: any) => c.email?.toLowerCase() === cand.email?.toLowerCase());
                                                            const phone = candData?.phone || '';
                                                            const link = `${window.location.origin}/#/interview/${interview.id}`;
                                                            const msg = `👋 Hi there!\n\nWe're actively hiring for the *${interview.title}* role and we'd love to invite you to take our AI-powered interview to fast-track your application! 🌟\n\n🚀 *Start your interview here:* \n${link}\n\n🔑 *Your Access Code:* \n${interview.accessCode}\n\nIt only takes a few minutes and you can complete it whenever you're ready. Best of luck! 🎉`;
                                                            setWhatsappModal({
                                                                isOpen: true,
                                                                email: cand.email,
                                                                phone: phone === 'N/A' ? '' : phone,
                                                                message: msg,
                                                                interview: interview
                                                            });
                                                        }}
                                                        className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 rounded-lg text-[10px] font-bold transition-all"
                                                        title="Invite via WhatsApp Web"
                                                    >
                                                        <i className="fab fa-whatsapp"></i>
                                                        <span>Invite</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-white/10 text-xs text-gray-500">
                        Created on: {interview.createdAt?.toDate ? interview.createdAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                    </div>
                </div>
            ))}
        </div>
    )}

    {isInviteModalOpen && selectedInterview && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col text-gray-900 dark:text-white">
                <h3 className="font-bold text-lg p-4 border-b border-gray-200 dark:border-gray-700">Invite Candidates</h3>
                <div className="p-4 space-y-4 overflow-y-auto">
                    <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg space-y-3">
                        <div>
                            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">Access Code</h4>
                            <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-600">
                                <span className="font-mono tracking-widest">{selectedInterview.accessCode}</span>
                                <button onClick={() => {navigator.clipboard.writeText(selectedInterview.accessCode || ''); messageBox.showSuccess('Access code copied!');}} className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors" title="Copy Access Code">
                                    <i className="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                        <div>
                            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">Interview Link</h4>
                            <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-600">
                                <span className="text-sm truncate mr-2 text-gray-600 dark:text-gray-400">
                                    {selectedInterview.interviewLink || `${window.location.origin}/#/interview/${selectedInterview.id}`}
                                </span>
                                <button onClick={() => {
                                    const link = selectedInterview.interviewLink || `${window.location.origin}/#/interview/${selectedInterview.id}`;
                                    navigator.clipboard.writeText(link);
                                    messageBox.showSuccess('Interview link copied!');
                                }} className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors" title="Copy Interview Link">
                                    <i className="fas fa-link"></i>
                                </button>
                            </div>
                        </div>
                        <div className="pt-2 text-right">
                             <button onClick={() => {
                                    const link = selectedInterview.interviewLink || `${window.location.origin}/#/interview/${selectedInterview.id}`;
                                    const text = `You've been invited to an interview for ${selectedInterview.title}.\n\nInterview Link: ${link}\nAccess Code: ${selectedInterview.accessCode}`;
                                    navigator.clipboard.writeText(text);
                                    messageBox.showSuccess('Full invite details copied!');
                             }} className="text-xs font-semibold text-primary hover:text-primary-dark">
                                 <i className="fas fa-clipboard-list mr-1"></i> Copy Full Invite Details
                             </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Upload Resume to Find Email</label>
                        <label className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                            <i className={`fas fa-cloud-upload-alt ${parsingResumes ? 'fa-spin' : ''}`}></i>
                            <span className="font-medium text-sm">{parsingResumes ? 'Parsing Resumes...' : 'Upload Resumes (PDF/DOCX/TXT)'}</span>
                            <input type="file" multiple accept=".pdf,.txt,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={handleResumeUpload} disabled={parsingResumes} />
                        </label>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Add Candidate Manually</label>
                        <div className="flex gap-2">
                            <input 
                                type="email" 
                                value={newEmail} 
                                onChange={(e) => setNewEmail(e.target.value)} 
                                placeholder="Candidate email" 
                                className="flex-1 p-2 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-sm outline-none" 
                            />
                            <input 
                                type="tel" 
                                value={manualPhone} 
                                onChange={(e) => setManualPhone(e.target.value)} 
                                placeholder="Phone number (optional)" 
                                className="w-1/3 p-2 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-sm outline-none" 
                            />
                            <button 
                                onClick={() => {
                                    if (!newEmail) return;
                                    setNewEmails([...newEmails, newEmail]);
                                    if (manualPhone) {
                                        setParsedCandidates(prev => [...prev, { email: newEmail.toLowerCase(), phone: manualPhone, matchScore: 'N/A' }]);
                                    }
                                    setNewEmail('');
                                    setManualPhone('');
                                }} 
                                className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600 transition-colors"
                            >
                                Add
                            </button>
                        </div>
                    </div>
                    <div>
                        <h4 className="font-semibold mb-2 text-sm">New Candidates to Invite:</h4>
                        {newEmails.length === 0 ? (
                             <p className="text-xs text-gray-500 italic">No candidates added yet. Upload resumes or add manually.</p>
                        ) : (
                            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto">
                                {newEmails.map(email => {
                                    const parsedData = parsedCandidates.find(c => c.email === email);
                                    
                                    let ScoreBadge = null;
                                    if (parsedData?.matchScore && parsedData.matchScore !== 'N/A') {
                                        const numScore = parseFloat(parsedData.matchScore);
                                        let badgeColor = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700';
                                        let icon = 'fas fa-minus-circle';
                                        
                                        if (!isNaN(numScore)) {
                                            if (numScore >= 75) {
                                                badgeColor = 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border shadow-sm border-green-200 dark:border-green-800';
                                                icon = 'fas fa-check-circle';
                                            } else if (numScore >= 50) {
                                                badgeColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border shadow-sm border-yellow-200 dark:border-yellow-800';
                                                icon = 'fas fa-exclamation-circle';
                                            } else {
                                                badgeColor = 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border shadow-sm border-red-200 dark:border-red-800';
                                                icon = 'fas fa-times-circle';
                                            }
                                        }
                                        
                                        ScoreBadge = (
                                            <div className={`mt-1 flex w-fit items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold ${badgeColor}`} title="AI Resume Match Score vs Job Description">
                                                <i className={icon}></i> Match: {parsedData.matchScore}%
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={email} className="flex items-start justify-between text-sm bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3 shadow-sm transition-colors hover:border-gray-300 dark:hover:border-gray-500">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-gray-900 dark:text-white mb-0.5">{email}</span>
                                                {parsedData?.phone && parsedData.phone !== 'N/A' && (
                                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-mono flex items-center gap-1.5"><i className="fas fa-phone-alt"></i>{parsedData.phone}</span>
                                                )}
                                                {ScoreBadge}
                                            </div>
                                            <button onClick={() => handleRemoveNewEmail(email)} className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700" title="Remove Candidate">
                                                <i className="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {selectedInterview.candidateEmails && selectedInterview.candidateEmails.length > 0 && (
                        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                            <h4 className="font-semibold mb-2 text-sm">Previously Invited Candidates:</h4>
                            <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                                {selectedInterview.candidateEmails.map((email) => {
                                    const isEditing = editingCandidateEmail === email;
                                    const isResending = resendingEmail === email;
                                    
                                    return (
                                        <div key={email} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-3 shadow-sm">
                                            {isEditing ? (
                                                <div className="flex-1 flex gap-2 mr-2">
                                                    <input 
                                                        type="email" 
                                                        value={editedEmailValue} 
                                                        onChange={(e) => setEditedEmailValue(e.target.value)} 
                                                        className="w-full p-1.5 text-sm border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-primary"
                                                        autoFocus
                                                    />
                                                    <button 
                                                        onClick={() => handleEditAndResend(email, editedEmailValue)}
                                                        disabled={resendingEmail !== null}
                                                        className="bg-green-500 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-green-600 disabled:opacity-50 flex items-center gap-1 shrink-0"
                                                    >
                                                        {isResending ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-save"></i>} Save
                                                    </button>
                                                    <button 
                                                        onClick={() => setEditingCandidateEmail(null)}
                                                        disabled={resendingEmail !== null}
                                                        className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-3 py-1.5 rounded text-xs font-semibold hover:bg-gray-300 dark:hover:bg-gray-500 shrink-0"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]" title={email}>{email}</span>
                                                    <div className="flex items-center gap-2">
                                                        <button 
                                                            onClick={() => { setEditingCandidateEmail(email); setEditedEmailValue(email); }}
                                                            disabled={resendingEmail !== null}
                                                            className="text-gray-500 hover:text-blue-500 transition-colors p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" 
                                                            title="Edit Email & Resend"
                                                        >
                                                            <i className="fas fa-pencil-alt text-xs"></i>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleResend(email)}
                                                            disabled={resendingEmail !== null}
                                                            className="text-gray-500 hover:text-green-500 transition-colors p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-1" 
                                                            title="Resend Invitation"
                                                        >
                                                            {isResending ? <i className="fas fa-spinner fa-spin text-xs"></i> : <i className="fas fa-paper-plane text-xs"></i>}
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
                    <button onClick={() => setIsInviteModalOpen(false)} className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-4 py-2 rounded">Cancel</button>
                    <button 
                        onClick={handleSendInvites} 
                        disabled={sendingEmails || newEmails.length === 0}
                        className="bg-green-500 text-white px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {sendingEmails ? (
                            <>
                                <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                                Sending...
                            </>
                        ) : 'Send Invites'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )}

    {editingJobId && <EditJobModal jobId={editingJobId} onClose={() => setEditingJobId(null)} />}

    {whatsappModal && whatsappModal.isOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-white/10 flex flex-col text-gray-900 dark:text-white transform transition-all duration-300">
                {/* Header */}
                <div className="flex items-center gap-3 p-4 bg-emerald-500/10 dark:bg-emerald-500/5 border-b border-emerald-500/20 dark:border-emerald-500/10">
                    <div className="p-2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                        <i className="fab fa-whatsapp text-xl"></i>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Send WhatsApp Invite</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Send an invitation link to the candidate via WhatsApp Web</p>
                    </div>
                    <button 
                        onClick={() => setWhatsappModal(null)} 
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Candidate Email</label>
                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-black/30 p-2.5 rounded-lg border border-gray-200 dark:border-zinc-800">
                            {whatsappModal.email}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Phone Number <span className="text-red-500">*</span></label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 font-medium text-sm">
                                <i className="fas fa-phone-alt mr-1"></i>
                            </span>
                            <input 
                                type="tel" 
                                value={whatsappModal.phone} 
                                onChange={(e) => setWhatsappModal({...whatsappModal, phone: e.target.value})} 
                                placeholder="Enter phone number (e.g. 9876543210)" 
                                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-zinc-800 text-sm outline-none"
                            />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">Include country code if outside India. 10-digit Indian numbers auto-prepend +91.</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Draft Message Preview</label>
                        <textarea 
                            value={whatsappModal.message} 
                            onChange={(e) => setWhatsappModal({...whatsappModal, message: e.target.value})} 
                            rows={6}
                            className="w-full p-3 border border-gray-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-zinc-800 text-xs font-mono outline-none leading-relaxed resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 p-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5">
                    <button 
                        onClick={() => setWhatsappModal(null)} 
                        className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={async () => {
                            if (!whatsappModal.phone.trim()) {
                                messageBox.showError("Please enter a valid phone number");
                                return;
                            }
                            
                            // Save phone to Firestore under candidateData array
                            try {
                                const intRef = doc(db, 'interviews', whatsappModal.interview.id);
                                const currentCandData = (whatsappModal.interview as any).candidateData || [];
                                const index = currentCandData.findIndex((c: any) => c.email.toLowerCase() === whatsappModal.email.toLowerCase());
                                
                                let updatedCandData = [...currentCandData];
                                if (index > -1) {
                                    updatedCandData[index] = { ...updatedCandData[index], phone: whatsappModal.phone };
                                } else {
                                    updatedCandData.push({ email: whatsappModal.email, phone: whatsappModal.phone });
                                }
                                
                                await updateDoc(intRef, {
                                    candidateData: updatedCandData
                                });
                                
                                // Update local state so it reflects immediately
                                setInterviews(prev => prev.map(inv => {
                                    if (inv.id === whatsappModal.interview.id) {
                                        return { ...inv, candidateData: updatedCandData };
                                    }
                                    return inv;
                                }));
                            } catch (err) {
                                console.error("Error updating phone in Firestore:", err);
                            }
                            
                            // Open WhatsApp web
                            const cleanedPhone = whatsappModal.phone.replace(/[^0-9]/g, '');
                            let targetPhone = cleanedPhone;
                            if (cleanedPhone.length === 10) {
                                targetPhone = '91' + cleanedPhone;
                            }
                            
                            const waUrl = `https://web.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(whatsappModal.message)}`;
                            window.open(waUrl, '_blank');
                            setWhatsappModal(null);
                            messageBox.showSuccess("Redirecting to WhatsApp Web...");
                        }}
                        className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
                    >
                        <i className="fab fa-whatsapp"></i>
                        <span>Send WhatsApp Invite</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )}
    </div>
    );
};

export default RecruiterInterviews;
