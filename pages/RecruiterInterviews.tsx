import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, deleteDoc, doc, updateDoc, arrayUnion, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { Interview } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
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
  const [newEmails, setNewEmails] = useState<string[]>([]);
  const [parsedCandidates, setParsedCandidates] = useState<{email: string, phone: string, matchScore?: string}[]>([]);
  const [submissionsMap, setSubmissionsMap] = useState<Record<string, any[]>>({});
  const [parsingResumes, setParsingResumes] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
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

  const handleSendInvites = async () => {
    if (!selectedInterview || newEmails.length === 0) return;
    
    setSendingEmails(true);
    try {
        await updateDoc(doc(db, 'interviews', selectedInterview.id), { 
            candidateEmails: arrayUnion(...newEmails) 
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
                                                <span className="text-yellow-600 dark:text-yellow-500 font-medium flex items-center gap-1.5 shrink-0">
                                                    <i className="fas fa-clock"></i> Pending
                                                </span>
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
                    <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                        <h4 className="font-semibold text-sm">Access Code</h4>
                        <div className="flex items-center justify-between">
                            <span className="font-mono text-lg tracking-widest">{selectedInterview.accessCode}</span>
                            <button onClick={() => navigator.clipboard.writeText(selectedInterview.accessCode || '')} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white" title="Copy Access Code">
                                <i className="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Upload Resume to Find Email</label>
                        <label className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
                            <i className={`fas fa-cloud-upload-alt ${parsingResumes ? 'fa-spin' : ''}`}></i>
                            <span className="font-medium text-sm">{parsingResumes ? 'Parsing Resumes...' : 'Upload Resumes (PDF/TXT)'}</span>
                            <input type="file" multiple accept=".pdf,.txt" className="hidden" onChange={handleResumeUpload} disabled={parsingResumes} />
                        </label>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Add Email Manually</label>
                        <div className="flex gap-2">
                            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Candidate email" className="w-full p-2 border rounded bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600" />
                            <button onClick={() => {setNewEmails([...newEmails, newEmail]); setNewEmail('');}} className="bg-blue-500 text-white px-4 py-2 rounded">Add</button>
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
    </div>
    );
};

export default RecruiterInterviews;
