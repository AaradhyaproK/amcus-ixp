import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import { useMessageBox } from '../components/MessageBox';
import { Interview, InterviewSubmission } from '../types';
import { sendInterviewInvitations } from '../services/brevoService';
import { evaluateResumeForMultipleJobs } from '../services/api';

// Setup PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface GlobalCandidate {
    email: string;
    phone: string;
    interviewId: string;
    interviewTitle: string;
    hasSubmitted: boolean;
    submissionId?: string;
    score?: number;
    invitedAt?: any;
    name?: string;
    resumeScore?: number;
    qnaScore?: number;
    resumeLink?: string;
}

const InvitedCandidates: React.FC = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [interviews, setInterviews] = useState<Interview[]>([]);
    const [globalCandidates, setGlobalCandidates] = useState<GlobalCandidate[]>([]);
    
    // Global Invite State
    const [selectedInterviewId, setSelectedInterviewId] = useState<string>('');
    const [parsingResumes, setParsingResumes] = useState(false);
    const [sendingEmails, setSendingEmails] = useState(false);
    const [newCandidates, setNewCandidates] = useState<{email: string, phone: string, scores?: Record<string, string>}[]>([]);
    const [manualEmail, setManualEmail] = useState('');
    const [manualPhone, setManualPhone] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [jobSearchTerm, setJobSearchTerm] = useState('');
    
    const messageBox = useMessageBox();

    useEffect(() => {
        if (!user) return;

        const fetchData = async () => {
            try {
                // 1. Fetch all interviews for this recruiter
                const q = query(
                    collection(db, 'interviews'), 
                    where('recruiterUID', '==', user.uid)
                );
                const snapshot = await getDocs(q);
                const fetchedInterviews = snapshot.docs
                    .map(d => ({id: d.id, ...d.data()} as Interview))
                    .filter(interview => interview.isMock !== true)
                    .sort((a, b) => {
                        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
                        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
                        return timeB - timeA;
                    });
                setInterviews(fetchedInterviews);

                // 2. Fetch submissions for all interviews
                const allCands: GlobalCandidate[] = [];
                for (const interview of fetchedInterviews) {
                    const attemptsSnap = await getDocs(collection(db, 'interviews', interview.id, 'attempts'));
                    const attempts = attemptsSnap.docs.map(d => ({id: d.id, ...d.data()} as InterviewSubmission));
                    
                    const candidateDataArray = (interview as any).candidateData || []; // New schema field we will use moving forward
                    const explicitEmails = (interview.candidateEmails || []).map((e:string) => e.toLowerCase());
                    
                    // Pass 1: Everyone who actually submitted
                    attempts.forEach(submission => {
                        const email = (submission.candidateInfo?.email || 'unknown').toLowerCase();
                        const enhancedData = candidateDataArray.find((c: any) => c.email.toLowerCase() === email);

                        allCands.push({
                            email: email,
                            phone: enhancedData?.phone || (submission.candidateInfo as any)?.phone || 'N/A',
                            interviewId: interview.id,
                            interviewTitle: interview.title || 'Untitled Role',
                            hasSubmitted: true,
                            submissionId: submission.id,
                            score: typeof submission.score === 'number' ? submission.score : parseFloat((submission.score as any) || '0'),
                            name: submission.candidateInfo?.name || 'Unknown User',
                            resumeScore: typeof submission.resumeScore === 'number' ? submission.resumeScore : parseFloat((submission.resumeScore as any) || '0'),
                            qnaScore: typeof submission.qnaScore === 'number' ? submission.qnaScore : parseFloat((submission.qnaScore as any) || '0'),
                            resumeLink: submission.candidateResumeURL || 'N/A'
                        });
                    });

                    // Pass 2: Everyone explicitly invited but who HAS NOT submitted
                    explicitEmails.forEach(email => {
                        const hasSubmitted = attempts.some(a => (a.candidateInfo?.email || '').toLowerCase() === email);
                        if (!hasSubmitted) {
                            const enhancedData = candidateDataArray.find((c: any) => c.email.toLowerCase() === email);
                            allCands.push({
                                email: email,
                                phone: enhancedData?.phone || 'N/A',
                                interviewId: interview.id,
                                interviewTitle: interview.title || 'Untitled Role',
                                hasSubmitted: false,
                                name: 'Pending Candidate'
                            });
                        }
                    });
                }
                setGlobalCandidates(allCands);
            } catch (err) {
                console.error("Error fetching data:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [user]);

    const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setParsingResumes(true);
        const parsed: {email: string, phone: string, scores?: Record<string, string>}[] = [];
        let filesProcessed = 0;
        
        const jobsPayload = interviews.map(i => ({ id: i.id, title: i.title, description: i.description }));

        const parsePromises = Array.from(files).map(async (file: File) => {
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
                    return;
                }

                const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
                const phoneMatch = text.match(/(?:\+?\d{1,4}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/);

                if (emailMatch) {
                    const email = emailMatch[1].toLowerCase();
                    const phone = phoneMatch ? phoneMatch[0] : 'N/A';
                    if (!parsed.some(c => c.email === email) && !newCandidates.some(c => c.email === email)) {
                        let scores = {};
                        if (text.length > 50 && jobsPayload.length > 0) {
                            try {
                                scores = await evaluateResumeForMultipleJobs(jobsPayload, text);
                            } catch (e) {
                                console.error('Multi job score error:', e);
                            }
                        }
                        if (!parsed.some(c => c.email === email)) {
                            parsed.push({ email, phone, scores });
                        }
                    }
                }
                filesProcessed++;
            } catch (error) {
                console.error(`Error parsing ${file.name}:`, error);
            }
        });

        await Promise.all(parsePromises);

        if (parsed.length > 0) {
            setNewCandidates(prev => [...prev, ...parsed]);
        }
        
        messageBox.showInfo(`Processed ${filesProcessed} file(s). Found ${parsed.length} new candidates.`);
        setParsingResumes(false);
        e.target.value = '';
    };

    const handleManualAdd = () => {
        if (!manualEmail) return;
        const lowerEmail = manualEmail.toLowerCase();
        if (!newCandidates.some(c => c.email === lowerEmail)) {
            setNewCandidates(prev => [...prev, { email: lowerEmail, phone: manualPhone || 'N/A' }]);
        }
        setManualEmail('');
        setManualPhone('');
    };

    const handleRemoveCandidate = (email: string) => {
        setNewCandidates(newCandidates.filter(c => c.email !== email));
    };

    const handleSendGlobalInvites = async () => {
        if (!selectedInterviewId) {
            messageBox.showError("Please select an interview to route these candidates to.");
            return;
        }
        if (newCandidates.length === 0) return;

        setSendingEmails(true);
        try {
            const selectedInterview = interviews.find(i => i.id === selectedInterviewId);
            if (!selectedInterview) throw new Error("Interview not found");

            const emailsOnly = newCandidates.map(c => c.email);

            // Update Database with standard strings AND our new structured candidateData array
            await updateDoc(doc(db, 'interviews', selectedInterviewId), { 
                candidateEmails: arrayUnion(...emailsOnly),
                candidateData: arrayUnion(...newCandidates)
            });
            
            const result = await sendInterviewInvitations(
                emailsOnly,
                selectedInterview.title,
                selectedInterview.interviewLink || '',
                selectedInterview.accessCode
            );

            if (result.success) {
                messageBox.showSuccess(`Successfully added and invited ${result.totalEmails} candidates!`);
                // Optimistically update the UI table
                const optimizedAdditions: GlobalCandidate[] = newCandidates.map(c => ({
                    email: c.email,
                    phone: c.phone,
                    interviewId: selectedInterview.id,
                    interviewTitle: selectedInterview.title,
                    hasSubmitted: false
                }));
                setGlobalCandidates(prev => [...optimizedAdditions, ...prev]);
                
                // We must also optimistically update the interview object in state so we don't accidentally re-invite them globally
                setInterviews(prev => prev.map(inv => {
                    if(inv.id === selectedInterviewId) {
                        return {...inv, candidateEmails: [...(inv.candidateEmails || []), ...emailsOnly]}
                    }
                    return inv;
                }));

                setNewCandidates([]);
            } else {
                messageBox.showError(`Failed to send emails: ${result.error}`);
            }
        } catch (error) {
            console.error('Invite sending error:', error);
            messageBox.showError('Failed to process invitations.');
        } finally {
            setSendingEmails(false);
        }
    };

    const filteredCandidates = useMemo(() => {
        if (!selectedInterviewId) return [];
        return globalCandidates.filter(c => 
            c.interviewId === selectedInterviewId &&
            (c.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
             c.phone.includes(searchTerm))
        );
    }, [globalCandidates, searchTerm, selectedInterviewId]);

    const filteredInterviews = useMemo(() => {
        return interviews.filter(inv => 
            (inv.title || '').toLowerCase().includes(jobSearchTerm.toLowerCase()) ||
            (inv.department || '').toLowerCase().includes(jobSearchTerm.toLowerCase())
        );
    }, [interviews, jobSearchTerm]);

    const exportToCSV = () => {
        const headers = ["Candidate Name", "Email", "Phone", "Invited Role", "Status", "Overall Score", "Resume Score", "Q&A Score", "Resume Link", "Report Link"];
        
        const csvContent = [
            headers.join(","),
            ...filteredCandidates.map(c => {
                const name = `"${(c.name || "Unknown").replace(/"/g, '""')}"`;
                const email = `"${c.email.replace(/"/g, '""')}"`;
                const phone = `"${(c.phone || "N/A").replace(/"/g, '""')}"`;
                const role = `"${c.interviewTitle.replace(/"/g, '""')}"`;
                const status = `"${c.hasSubmitted ? 'Submitted' : 'Pending'}"`;
                const score = c.hasSubmitted ? `"${c.score?.toFixed(0) || '0'}"` : '"-"';
                const resumeScore = c.hasSubmitted ? `"${c.resumeScore?.toFixed(0) || '0'}"` : '"-"';
                const qnaScore = c.hasSubmitted ? `"${c.qnaScore?.toFixed(0) || '0'}"` : '"-"';
                const resumeLink = c.hasSubmitted ? `"${(c.resumeLink || "N/A").replace(/"/g, '""')}"` : '"-"';
                const reportUrl = c.hasSubmitted ? `"${window.location.origin}/#/report/${c.interviewId}/${c.submissionId}"` : '"-"';
                
                return [name, email, phone, role, status, score, resumeScore, qnaScore, resumeLink, reportUrl].join(",");
            })
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Invited_Candidates_Export.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Invited Candidates Hub</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Cross-platform roster and invitation engine.</p>
                </div>
            </div>

            {/* Global Invite Widget */}
            <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4"><i className="fas fa-paper-plane text-primary mr-2"></i> Mass Invitation Engine</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
                    {/* Step 1: Select Interview */}
                    <div className="space-y-2 lg:border-r border-gray-200 dark:border-white/5 lg:pr-6">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">1. Select Interview Route</label>
                        <input
                            type="text"
                            placeholder="Search active jobs..."
                            value={jobSearchTerm}
                            onChange={(e) => setJobSearchTerm(e.target.value)}
                            className="w-full p-2 mb-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-transparent bg-white dark:bg-black transition-all"
                        />
                        <select 
                            value={selectedInterviewId}
                            onChange={(e) => setSelectedInterviewId(e.target.value)}
                            className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary focus:border-transparent bg-gray-50 dark:bg-black/50 dark:text-white"
                        >
                            <option value="">-- Choose Active Interview --</option>
                            {filteredInterviews.map(inv => (
                                <option key={inv.id} value={inv.id}>{inv.title} ({inv.department || 'General'})</option>
                            ))}
                        </select>
                        {selectedInterviewId && (() => {
                            const selectedInterview = interviews.find(i => i.id === selectedInterviewId);
                            if (!selectedInterview) return null;
                            const link = window.location.origin + '/#/interview/' + selectedInterview.id;
                            const template = `👋 Hi there!\n\nWe're actively hiring for the *${selectedInterview.title}* role and your profile caught our eye! 🌟\n\nWe'd love to invite you to take our next-gen AI-powered interview to fast-track your application. It only takes a few minutes and you can complete it whenever you're ready!\n\n🚀 *Start your interview here:* \n${link}\n\n🔑 *Your Access Code:* \n${selectedInterview.accessCode}\n\nBest of luck, and we can't wait to see your skills in action! 🎉`;
                            return (
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(template);
                                        messageBox.showSuccess('WhatsApp template copied to clipboard!');
                                    }}
                                    className="w-full mt-3 p-2.5 bg-[#25D366]/10 text-[#128C7E] dark:text-[#25D366] hover:bg-[#25D366]/20 border border-[#25D366]/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
                                    title="Copy Invite Template for WhatsApp"
                                >
                                    <i className="fab fa-whatsapp text-base"></i> Copy WP Invite Msg
                                </button>
                            );
                        })()}
                    </div>

                    {/* Step 2: Extract from Resumes */}
                    <div className="space-y-2 lg:border-r border-gray-200 dark:border-white/5 lg:px-6">
                         <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">2. Smart Parse Resumes</label>
                         <label className="flex flex-col items-center justify-center gap-2 px-4 py-6 bg-gray-50 dark:bg-black/50 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors h-[100px]">
                            <i className={`fas fa-cloud-upload-alt text-2xl text-gray-400 ${parsingResumes ? 'fa-spin text-primary' : ''}`}></i>
                            <span className="font-medium text-xs text-gray-500 whitespace-nowrap">{parsingResumes ? 'Scanning Documents...' : 'Drop PDFs/TXTs Here'}</span>
                            <input type="file" multiple accept=".pdf,.txt" className="hidden" onChange={handleResumeUpload} disabled={parsingResumes} />
                        </label>
                    </div>

                    {/* Step 3: Manual Entry */}
                    <div className="space-y-2 lg:border-r border-gray-200 dark:border-white/5 lg:px-6">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Or Add Manually</label>
                        <input type="email" value={manualEmail} onChange={e=>setManualEmail(e.target.value)} placeholder="Email Address" className="w-full p-2 border border-gray-200 dark:border-gray-700 rounded-t-lg focus:ring-primary bg-white dark:bg-black text-sm" />
                        <div className="flex">
                            <input type="text" value={manualPhone} onChange={e=>setManualPhone(e.target.value)} placeholder="Phone Number (Optional)" className="w-full p-2 border-b border-l border-r border-gray-200 dark:border-gray-700 rounded-bl-lg focus:ring-primary bg-white dark:bg-black text-sm" />
                            <button onClick={handleManualAdd} className="bg-gray-200 dark:bg-gray-700 px-4 rounded-br-lg text-sm font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Add</button>
                        </div>
                    </div>

                    {/* Deployment Zone */}
                    <div className="space-y-2 lg:pl-6">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Deploy Invites</label>
                        <div className="bg-gray-50 dark:bg-black/50 rounded-xl p-3 max-h-[160px] overflow-y-auto border border-gray-200 dark:border-white/5 mb-3">
                            {newCandidates.length === 0 ? (
                                <p className="text-xs text-center text-gray-400 italic py-2">Queue is empty.</p>
                            ) : (
                                <div className="space-y-1">
                                    {newCandidates.map(c => {
                                        let ScoreBadge = null;
                                        if (selectedInterviewId && c.scores && c.scores[selectedInterviewId]) {
                                            const numScore = parseFloat(c.scores[selectedInterviewId]);
                                            let badgeColor = 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
                                            if (!isNaN(numScore)) {
                                                if (numScore >= 75) badgeColor = 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300 border border-green-200 dark:border-green-800/50';
                                                else if (numScore >= 50) badgeColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800/50';
                                                else badgeColor = 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300 border border-red-200 dark:border-red-800/50';
                                            }
                                            ScoreBadge = (
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ml-2 ${badgeColor}`} title="AI Match for Selected Role">
                                                    Match: {c.scores[selectedInterviewId]}%
                                                </span>
                                            );
                                        }

                                        return (
                                            <div key={c.email} className="flex justify-between items-center text-xs bg-white dark:bg-gray-800 px-2 py-1.5 rounded border border-gray-100 dark:border-gray-700">
                                                <div className="truncate flex items-center">
                                                    <span className="truncate max-w-[100px]" title={c.email}>{c.email}</span>
                                                    {ScoreBadge}
                                                </div>
                                                <button onClick={()=>handleRemoveCandidate(c.email)} className="text-red-500 hover:text-red-700 font-bold px-1">&times;</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={handleSendGlobalInvites}
                            disabled={sendingEmails || newCandidates.length === 0}
                            className="w-full bg-primary hover:bg-primary-dark text-white p-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 transition-all"
                        >
                             {sendingEmails ? <><i className="fas fa-circle-notch fa-spin"></i> Dispatching...</> : <><i className="fas fa-paper-plane"></i> Dispatch {newCandidates.length} Invites</>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Global Roster Table */}
            {selectedInterviewId ? (
                <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 dark:bg-black/20 rounded-t-2xl">
                        <div className="flex items-center gap-4">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">Active Candidates Tracking</h3>
                            <div className="hidden sm:flex items-center gap-2">
                                <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold border border-primary/20 shadow-sm">
                                    {filteredCandidates.filter(c => c.hasSubmitted).length} Responses
                                </span>
                                <span className="bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-full text-xs font-bold border border-gray-300 dark:border-gray-700 shadow-sm">
                                    {filteredCandidates.length} Tracked
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                            <div className="relative w-full sm:w-64">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <i className="fas fa-search text-gray-400"></i>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search email or phone..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-transparent bg-gray-50 dark:bg-black transition-all"
                                />
                            </div>
                            <button
                                onClick={exportToCSV}
                                className="flex-shrink-0 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors focus:ring-2 focus:ring-green-500 shadow-sm"
                            >
                                 <i className="fas fa-file-excel"></i> <span className="hidden sm:inline">Export CSV</span>
                            </button>
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-600 dark:text-gray-400">
                            <thead className="bg-gray-50 dark:bg-black/30 text-xs uppercase font-semibold text-gray-500 dark:text-gray-500">
                                <tr>
                                    <th className="px-6 py-4">Candidate Identity</th>
                                    <th className="px-6 py-4">Invited Role</th>
                                    <th className="px-6 py-4 text-center">Status</th>
                                    <th className="px-6 py-4 text-center">Score</th>
                                    <th className="px-6 py-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {filteredCandidates.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center">
                                                <i className="fas fa-users-slash text-4xl text-gray-300 dark:text-gray-600 mb-3"></i>
                                                <p className="text-gray-500 dark:text-gray-400 text-base">No tracked candidates found in system.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredCandidates.map((candidate, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-900 dark:text-gray-200">{candidate.email}</div>
                                                {candidate.phone !== 'N/A' && <div className="text-xs text-blue-500 dark:text-blue-400 font-mono mt-1"><i className="fas fa-phone-alt opacity-70 mr-1"></i>{candidate.phone}</div>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full text-xs font-medium border border-gray-200 dark:border-gray-700">{candidate.interviewTitle}</span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {candidate.hasSubmitted ? (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-100/50 dark:bg-green-500/10 text-green-700 dark:text-green-400 text-xs font-bold border border-green-200 dark:border-green-500/20">
                                                        <i className="fas fa-check-circle"></i> Submitted
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-100/50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 text-xs font-bold border border-yellow-200 dark:border-yellow-500/20">
                                                        <i className="fas fa-clock"></i> Pending
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {candidate.hasSubmitted ? (
                                                    <span className="font-bold text-gray-900 dark:text-white">{candidate.score?.toFixed(0)}<span className="text-[10px] text-gray-400 ml-0.5">/10</span></span>
                                                ) : <span className="text-gray-400">-</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {candidate.hasSubmitted ? (
                                                     <Link to={`/report/${candidate.interviewId}/${candidate.submissionId}`} target="_blank" className="text-primary hover:text-primary-dark font-medium text-xs bg-primary/10 px-3 py-1.5 rounded-lg transition-colors">View Report</Link>
                                                ) : (
                                                     <button className="text-gray-400 hover:text-blue-500 transition-colors" title="Re-send Invitation"><i className="fas fa-redo-alt"></i></button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 border-dashed shadow-sm p-16 text-center transition-all">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
                        <i className="fas fa-hand-pointer text-3xl"></i>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Select an Interview Route</h3>
                    <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">Please select a specific interview from the dropdown above to view the associated candidates, track their progress, and export their reports.</p>
                </div>
            )}
        </div>
    );
}

export default InvitedCandidates;
