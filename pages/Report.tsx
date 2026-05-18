import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { InterviewSubmission } from '../types';
import { createPortal } from 'react-dom';
import { jsPDF } from 'jspdf';
import { useMessageBox } from '../components/MessageBox';
import { ArrowLeft, Download, Share2, User, FileText, MessageSquare, Brain, Shield, Video, CheckCircle, XCircle, Briefcase, MapPin, GraduationCap, DollarSign, Calendar, Award, Link as LinkIcon } from 'lucide-react';

// New component for radial score display
const ScoreCircle: React.FC<{ score: number; denom: number; color: 'green' | 'yellow' | 'red'; label: string }> = ({ score, denom, color, label }) => {
    const pct = denom > 0 ? (score / denom) * 100 : 0;
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;

    const colorClasses = {
        green: 'text-green-500',
        yellow: 'text-yellow-500',
        red: 'text-red-500',
    };
    const textColor = colorClasses[color];

    return (
        <div className="flex flex-col items-center gap-3 text-center">
            <div className="relative w-28 h-28">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                    <circle
                        className="text-gray-100 dark:text-white/5"
                        strokeWidth="8"
                        stroke="currentColor"
                        fill="transparent"
                        r={radius}
                        cx="50"
                        cy="50"
                    />
                    <circle
                        className={textColor}
                        strokeWidth="8"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r={radius}
                        cx="50"
                        cy="50"
                        transform="rotate(-90 50 50)"
                        style={{ transition: 'stroke-dashoffset 1s ease-out' }}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-bold ${textColor}`}>{score.toFixed(1)}</span>
                    <span className="text-sm text-gray-400">/ {denom}</span>
                </div>
            </div>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">{label}</p>
        </div>
    );
};

const BehavioralStat: React.FC<{ icon: React.ReactNode, label: string, value: string | number, color: 'green' | 'yellow' | 'red' | 'blue' | 'purple' }> = ({ icon, label, value, color }) => {
    const colorClasses = `bg-${color}-100 dark:bg-${color}-900/30 text-${color}-600 dark:text-${color}-400`;
    return (
        <div className={`flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5`}>
            <div className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg shadow-sm ${colorClasses}`}>{icon}</div>
            <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
            </div>
        </div>
    );
};

const ProfileDetailItem: React.FC<{ label: string; value?: string | React.ReactNode; fullWidth?: boolean }> = ({ label, value, fullWidth }) => {
    if (!value && value !== 0) return null;
    return (
        <div className={fullWidth ? 'col-span-1 md:col-span-2' : ''}>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">{label}</p>
            <div className="font-semibold text-gray-800 dark:text-gray-200 mt-1 text-sm">{value}</div>
        </div>
    );
};

const InterviewReport: React.FC = () => {
  const navigate = useNavigate();
  const messageBox = useMessageBox();
  const { interviewId, submissionId } = useParams<{ interviewId: string; submissionId?: string }>();
  const [submission, setSubmission] = useState<InterviewSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [profileTextData, setProfileTextData] = useState<string>('');
  const [activeVideoIndex, setActiveVideoIndex] = useState<number | null>(null);
  const [showResumeInVideo, setShowResumeInVideo] = useState<boolean>(false);
  const [isCompareMode, setIsCompareMode] = useState(false);

  useEffect(() => {
    const fetchSubmission = async () => {
      if (!interviewId) return;
      try {
        if (submissionId) {
          const docRef = doc(db, 'interviews', interviewId, 'attempts', submissionId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setSubmission({ id: docSnap.id, ...docSnap.data() } as InterviewSubmission);
          }
        } else {
          // Legacy: The report is embedded directly on the interview document
          const docRef = doc(db, 'interviews', interviewId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Map legacy fields to current InterviewSubmission format to avoid breaks
            const mappedSubmission: any = {
              id: docSnap.id,
              ...data,
              candidateInfo: data.candidateInfo || { name: data.candidateName || 'Candidate', email: data.candidateEmail || 'Unknown' },
              feedback: data.feedback || (data.report && data.report.feedback) || '',
              score: data.score || (data.report && data.report.score) || 0,
            };
            setSubmission(mappedSubmission as InterviewSubmission);
          }
        }
        setLoading(false);
      } catch (error) {
        console.error("Error fetching submission:", error);
        setLoading(false);
      }
    };
    fetchSubmission();
  }, [interviewId, submissionId]);

  const getScoreValue = (score: unknown): string => {
    let value = 0;
    if (typeof score === 'string' && score.includes('/')) {
      value = parseInt(score.split('/')[0], 10);
    } else if (typeof score === 'number') {
      value = Math.round(score);
    }
    // Convert score out of 100 to score out of 10
    return (value / 10).toFixed(1); // Ensure one decimal place
  };

  const getScoreDenom = (score: unknown): string => {
    // The new denominator should always be 10
    return '10';
  };

  const getScoreColorName = (score: number, denom?: string): 'green' | 'yellow' | 'red' => {
    const d = Number(denom || '10');
    const pct = d > 0 ? (score / d) * 100 : 0;
    if (pct >= 75) return 'green';
    if (pct >= 50) return 'yellow';
    return 'red';
  };

  const verdictColor = (verdict: string) => {
    const v = verdict.toLowerCase();
    // New verdict values
    if (v.includes('recommended')) return { bg: 'bg-green-50 dark:bg-green-900/30', border: 'border-green-300 dark:border-green-700', text: 'text-green-700 dark:text-green-300' };
    if (v.includes('reservations')) return { bg: 'bg-yellow-50 dark:bg-yellow-900/30', border: 'border-yellow-300 dark:border-yellow-700', text: 'text-yellow-700 dark:text-yellow-300' };
    if (v.includes('not recommended')) return { bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-300 dark:border-red-700', text: 'text-red-700 dark:text-red-300' };
    // Fallback for old values for backward compatibility
    if (v.includes('strong hire')) return { bg: 'bg-green-50 dark:bg-green-900/30', border: 'border-green-300 dark:border-green-700', text: 'text-green-700 dark:text-green-300' };
    if (v.includes('hire')) return { bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-300' };
    if (v.includes('leaning no')) return { bg: 'bg-yellow-50 dark:bg-yellow-900/30', border: 'border-yellow-300 dark:border-yellow-700', text: 'text-yellow-700 dark:text-yellow-300' };
    if (v.includes('no hire')) return { bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-300 dark:border-red-700', text: 'text-red-700 dark:text-red-300' };
    return { bg: 'bg-gray-100 dark:bg-gray-800', border: 'border-gray-300 dark:border-gray-700', text: 'text-gray-700 dark:text-gray-300' };
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      messageBox.showSuccess('Report link copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy link: ', err);
      messageBox.showError('Failed to copy link.');
    });
  };

  const handleDownloadPDF = () => {
    if (!submission) return messageBox.showError("No report data found to download.");
    messageBox.showInfo("Generating PDF... Please wait.");

    try {
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const margin = 15;
        const contentW = pageW - margin * 2;
        let y = margin;

        const checkPage = (needed: number) => {
            if (y + needed > pageH - margin) { pdf.addPage(); y = margin; }
        };

        const drawSectionHeader = (text: string) => {
            checkPage(12);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setTextColor(15, 23, 42);
            pdf.text(text, margin, y);
            y += 5;
            pdf.setDrawColor(226, 232, 240);
            pdf.setLineWidth(0.2);
            pdf.line(margin, y, margin + contentW, y);
            y += 8;
        };

        const drawInfoBox = (label: string, value: string, x: number, boxY: number, boxW: number) => {
            pdf.setFillColor(248, 250, 252);
            pdf.setDrawColor(226, 232, 240);
            pdf.setLineWidth(0.3);
            pdf.roundedRect(x, boxY, boxW, 16, 2, 2, 'FD');
            pdf.setFontSize(8);
            pdf.setTextColor(100, 116, 139);
            pdf.text(label, x + 4, boxY + 6);
            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(15, 23, 42);
            
            // Protect against long text overflow
            const valStr = (value || 'N/A').toString();
            const valueLines = pdf.splitTextToSize(valStr, boxW - 6);
            if (valueLines.length > 1) {
                pdf.setFontSize(8);
                pdf.text(valueLines[0].substring(0, 30) + '...', x + 4, boxY + 12);
            } else {
                pdf.text(valStr, x + 4, boxY + 12);
            }
        };

        // 1. HEADER
        pdf.setFillColor(37, 99, 235);
        pdf.rect(0, 0, pageW, 30, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(18);
        pdf.setTextColor(255, 255, 255);
        pdf.text('InterviewXpert Report', margin, 18);
        y = 40;

        // 2. CANDIDATE & JOB INFO
        const candName = submission.candidateInfo?.name || 'Candidate';
        const jobTitle = submission.jobTitle || 'Interview';
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(22);
        pdf.setTextColor(15, 23, 42);
        pdf.text(candName, margin, y);
        y += 8;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(12);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`Applying for: ${jobTitle}`, margin, y);
        y += 6;
        const dateStr = submission.submittedAt?.toDate ? submission.submittedAt.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
        pdf.setFontSize(10);
        pdf.text(`Date: ${dateStr} | Email: ${submission.candidateInfo?.email || 'N/A'}`, margin, y);
        y += 15;

        // 3. VERDICT & SCORES
        checkPage(35);
        const { verdict, summary, roleFit, communicationSkills, technicalSkills } = parseFeedback(submission.feedback);
        const vColor = verdictColor(verdict);
        const verdictBg = vColor.bg.includes('green') ? [236, 253, 245] : vColor.bg.includes('yellow') ? [254, 252, 232] : vColor.bg.includes('red') ? [254, 242, 242] : [241, 245, 249];
        const verdictBorder = vColor.border.includes('green') ? [167, 243, 208] : vColor.border.includes('yellow') ? [252, 211, 77] : vColor.border.includes('red') ? [252, 165, 165] : [226, 232, 240];
        const verdictText = vColor.text.includes('green') ? [21, 128, 61] : vColor.text.includes('yellow') ? [180, 83, 9] : vColor.text.includes('red') ? [185, 28, 28] : [55, 65, 81];
        
        pdf.setFillColor(verdictBg[0], verdictBg[1], verdictBg[2]);
        pdf.setDrawColor(verdictBorder[0], verdictBorder[1], verdictBorder[2]);
        pdf.setLineWidth(0.5);
        pdf.roundedRect(margin, y, contentW, 20, 3, 3, 'FD');
        pdf.setFontSize(8);
        pdf.setTextColor(verdictText[0], verdictText[1], verdictText[2]);
        pdf.text('HIRING VERDICT', pageW / 2, y + 7, { align: 'center' });
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text(verdict.toUpperCase(), pageW / 2, y + 15, { align: 'center' });
        y += 28;

        const scores = [
            { label: 'Overall Score', value: getScoreValue(submission.score), denom: getScoreDenom(submission.score) },
            { label: 'Resume Match',  value: getScoreValue(submission.resumeScore), denom: getScoreDenom(submission.resumeScore) },
            { label: 'Q&A Score',     value: getScoreValue(submission.qnaScore),    denom: getScoreDenom(submission.qnaScore) },
        ];
        const cardW = (contentW - 8) / 3;
        scores.forEach((s, i) => {
            drawInfoBox(s.label, `${s.value}/${s.denom}`, margin + i * (cardW + 4), y, cardW);
        });
        y += 24;

        // 4. CANDIDATE PROFILE DETAILS
        if (submission.candidateInfo) {
            drawSectionHeader("Candidate Profile");
            const info = submission.candidateInfo;
            const col1X = margin;
            const col2X = margin + contentW / 2 + 4;
            const colW = contentW / 2 - 4;
            
            let profileDetails = [];
            profileDetails.push({ label: 'Experience Level', value: info.experienceType });
            if (info.experienceType === 'experienced') {
                profileDetails.push({ label: 'Total Experience', value: `${info.totalExperienceYears}y ${info.totalExperienceMonths}m` });
                profileDetails.push({ label: 'Work Status', value: info.workStatus?.replace('_', ' ') });
                profileDetails.push({ label: info.workStatus === 'working' ? 'Current Company' : 'Last Company', value: info.workStatus === 'working' ? info.currentCompany : info.pastCompany });
                profileDetails.push({ label: 'Current Salary', value: `${info.currentSalary} LPA` });
                profileDetails.push({ label: 'Expected Salary', value: `${info.expectedSalary} LPA` });
                profileDetails.push({ label: 'Has Salary Proof', value: info.hasSalaryProof });
            } else { // Fresher
                profileDetails.push({ label: 'Graduation Year', value: info.graduationYear });
                profileDetails.push({ label: 'College', value: info.collegeName });
                profileDetails.push({ label: 'Degree', value: `${info.degree} in ${info.specialization}` });
            }
            profileDetails.push({ label: 'Current Location', value: info.currentLocation });
            profileDetails.push({ label: 'Ready to Relocate', value: info.readyToRelocate });

            for (let i = 0; i < profileDetails.length; i++) {
                checkPage(20);
                const xPos = i % 2 === 0 ? col1X : col2X;
                drawInfoBox(profileDetails[i].label, profileDetails[i].value || 'N/A', xPos, y, colW);
                if (i % 2 !== 0 || i === profileDetails.length - 1) {
                    y += 20;
                }
            }
            y += 4;
        }

        // 5. AI EVALUATION
        drawSectionHeader("AI Evaluation");
        const aiSections = [
            { title: 'Executive Summary', body: summary },
            { title: 'Role & Resume Fit', body: roleFit },
            { title: 'Role Fit as per AI Interview', body: communicationSkills },
            { title: 'Technical / Domain Skills', body: technicalSkills },
        ];

        aiSections.forEach(sec => {
            if (!sec.body || sec.body === 'N/A') return;

            checkPage(20);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(10);
            pdf.setTextColor(15, 23, 42); 
            
            // Add a small primary-colored accent rectangle next to the title
            pdf.setFillColor(37, 99, 235);
            pdf.rect(margin, y - 3, 1.5, 4, 'F');
            
            pdf.text(sec.title, margin + 4, y);
            y += 6;

            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(71, 85, 105);
            
            const bodyLines = pdf.splitTextToSize(sec.body, contentW - 4);
            const blockH = bodyLines.length * 4.5 + 4;
            checkPage(blockH + 5);
            
            pdf.text(bodyLines, margin + 4, y);
            y += blockH + 6;
        });
        y += 2;

        // 6. SESSION INTEGRITY
        if (submission.meta) {
            drawSectionHeader("Session Integrity");
            drawInfoBox('Tab Switches', `${submission.meta.tabSwitchCount ?? 0}`, margin, y, Math.min(contentW, 48));
            y += 24;
        }

        // 7. Q&A TRANSCRIPTS
        if (submission.questions && submission.questions.length > 0) {
            drawSectionHeader("Interview Transcript");
            submission.questions.forEach((q, idx) => {
                const transcript = submission.transcriptTexts?.[idx] || 'Transcript not available.';
                const qLines = pdf.splitTextToSize(`Q${idx + 1}: ${q}`, contentW);
                const tLines = pdf.splitTextToSize(transcript, contentW - 10);
                const blockH = 6 + qLines.length * 5 + 4 + tLines.length * 4.5 + 6;
                checkPage(blockH + 4);

                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(10);
                pdf.setTextColor(15, 23, 42);
                pdf.text(qLines, margin, y);
                y += qLines.length * 5 + 4;

                pdf.setFillColor(248, 250, 252);
                pdf.roundedRect(margin, y, contentW, tLines.length * 4.5 + 8, 2, 2, 'F');
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(9);
                pdf.setTextColor(82, 82, 91);
                pdf.text(tLines, margin + 4, y + 6);
                y += tLines.length * 4.5 + 8 + 8;
            });
        }

        // 8. FOOTER
        const totalPages = (pdf as any).internal.getNumberOfPages();
        for (let pg = 1; pg <= totalPages; pg++) {
            pdf.setPage(pg);
            pdf.setDrawColor(226, 232, 240);
            pdf.line(margin, pageH - 12, pageW - margin, pageH - 12);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(148, 163, 184);
            pdf.text('Generated by InterviewXpert', margin, pageH - 7);
            pdf.text(`Page ${pg} of ${totalPages}`, pageW - margin, pageH - 7, { align: 'right' });
        }

        pdf.save(`InterviewReport_${candName.replace(/\s/g, '_')}.pdf`);
        messageBox.showSuccess("Report downloaded successfully!");
    } catch (error) {
        console.error("PDF generation failed", error);
        messageBox.showError("Could not generate PDF. Please try again.");
    }
  };

  const parseFeedback = (feedback: unknown) => {
    if (typeof feedback !== 'string') {
      return {
        summary: 'N/A',
        roleFit: 'N/A',
        communicationSkills: 'N/A',
        technicalSkills: 'N/A',
        verdict: 'Not Available'
      };
    }

    const summaryMatch = feedback.match(/\*\*Overall Evaluation:\*\*([\s\S]*?)(?=\*\*Verdict:\*\*|\*\*Scores:\*\*|$)/);
    const roleFitMatch = feedback.match(/\*\*Resume Analysis:\*\*([\s\S]*?)(?=\*\*Answer Quality:\*\*|\*\*Scores:\*\*|$)/);
    const answerQualityBlock = feedback.match(/\*\*Answer Quality:\*\*([\s\S]*?)(?=\*\*Overall Evaluation:\*\*|\*\*Scores:\*\*|$)/);
    
    let communicationSkills = 'N/A';
    let technicalSkills = 'N/A';
    if (answerQualityBlock && answerQualityBlock[1]) {
      const commsMatch = answerQualityBlock[1].match(/\*\*Communication Skills:\*\*([\s\S]*?)(?=\*\*Technical Skills:\*\*|$)/);
      const techMatch = answerQualityBlock[1].match(/\*\*Technical Skills:\*\*([\s\S]*)/);
      communicationSkills = commsMatch ? commsMatch[1].trim() : 'N/A';
      technicalSkills = techMatch ? techMatch[1].trim() : 'N/A';
      // Fallback if sub-headings are not present in older reports
      if (communicationSkills === 'N/A' && technicalSkills === 'N/A') {
        communicationSkills = answerQualityBlock[1].trim();
      }
    }

    const verdictMatch = feedback.match(/\*\*Verdict:\*\*\s*(.*)/);
    
    const keyStrengthMatch = feedback.match(/(?:-\s*)?Key strength:\s*([^\n]*)/i);
    const keyWeaknessMatch = feedback.match(/(?:-\s*)?Key weakness:\s*([^\n]*)/i);

    return {
        summary: summaryMatch ? summaryMatch[1].trim() : 'N/A',
        roleFit: roleFitMatch ? roleFitMatch[1].trim() : 'N/A',
        communicationSkills,
        technicalSkills,
        verdict: verdictMatch ? verdictMatch[1].trim() : 'Not Available',
        keyStrength: keyStrengthMatch ? keyStrengthMatch[1].trim() : null,
        keyWeakness: keyWeaknessMatch ? keyWeaknessMatch[1].trim() : null
    };
  };

  if (loading) {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary"></div>
        </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center text-center">
          <div>
              <i className="fas fa-file-excel text-5xl text-red-500 mb-4"></i>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Report Not Found</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">The requested interview report could not be found.</p>
          </div>
      </div>
    );
  }

  const { summary, roleFit, communicationSkills, technicalSkills, verdict, keyStrength, keyWeakness } = parseFeedback(submission.feedback);
  const vColor = verdictColor(verdict);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] text-gray-800 dark:text-gray-200 font-sans p-4 md:p-8">
        {/* Sticky Header */}
        <div className="sticky top-0 z-40 bg-white/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-white/10 mb-6 shadow-sm">
            <div className="max-w-6xl mx-auto flex justify-between items-center p-4">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-primary transition-colors" title="Go Back">
                    <ArrowLeft size={18} /> Back
                </button>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleShare}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-white/10 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-white/10 rounded-lg font-semibold hover:bg-gray-50 dark:hover:bg-white/20 transition-all shadow-sm"
                        title="Copy Report Link"
                    >
                        <LinkIcon size={16} /> Copy Link
                    </button>
                    <button 
                        onClick={handleDownloadPDF} 
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary-dark transition-all shadow-sm"
                    >
                        <Download size={16} /> Download PDF
                    </button>
                </div>
            </div>
        </div>

        <div id="report-content" className={`mx-auto transition-all duration-300 ${isCompareMode ? 'max-w-full flex flex-col xl:flex-row gap-6' : 'max-w-7xl space-y-6'}`}>
            
            <div className={`space-y-6 flex-1 w-full ${isCompareMode ? 'xl:w-1/2' : ''}`}>
                {/* Header & Candidate Info */}
                <div className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-200 dark:border-white/10 shadow-sm flex flex-col md:flex-row gap-6 justify-between items-center">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2">
                        {submission.candidateInfo?.name || 'Candidate'}'s Report
                    </h1>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2"><i className="fas fa-envelope"></i> {submission.candidateInfo?.email || 'N/A'}</div>
                        <div className="flex items-center gap-2"><i className="fas fa-calendar-alt"></i> {submission.submittedAt?.toDate ? submission.submittedAt.toDate().toLocaleString('en-GB') : 'N/A'}</div>
                        {submission.candidateResumeURL && !submission.candidateResumeURL.startsWith('data:text/plain') && (
                            <div className="flex items-center gap-2 max-w-xs sm:max-w-sm">
                                <i className="fas fa-eye text-blue-500"></i> 
                                <button onClick={() => setIsResumeModalOpen(true)} className="text-blue-500 hover:underline truncate font-medium text-left" title="View Resume Inline">
                                    View Resume (PDF)
                                </button>
                            </div>
                        )}
                        {submission.candidateResumeURL?.startsWith('data:text/plain') && (
                            <div className="flex items-center gap-2">
                                <FileText size={14} className="text-blue-500" />
                                <span className="text-blue-500">Generated Resume Text</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap gap-3 items-center justify-end">
                    {submission.candidateResumeURL && !submission.candidateResumeURL.startsWith('data:text/plain') && (
                        <button onClick={() => setIsCompareMode(!isCompareMode)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${isCompareMode ? 'bg-primary/10 text-primary border-primary/30' : 'bg-white dark:bg-white/5 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/10'}`}>
                            <FileText size={16} /> {isCompareMode ? 'Exit Compare Mode' : 'Compare Resume'}
                        </button>
                    )}
                    <button onClick={() => setIsResumeModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-white/20 transition-colors">
                        <User size={16} /> View Profile Data
                    </button>
                </div>

            </div>

            <div className={`grid grid-cols-1 gap-6 ${isCompareMode ? '' : 'lg:grid-cols-3'}`}>
                {/* Main Content */}
                <div className={`space-y-6 ${isCompareMode ? '' : 'lg:col-span-2'}`}>
                    {/* AI Summary Card */}
                    <div className="bg-white dark:bg-white/5 rounded-2xl p-6 md:p-8 border border-gray-200 dark:border-white/10 shadow-sm">
                        <h2 className="text-xl font-bold mb-6 flex items-center gap-3"><Brain size={24} className="text-primary"/> Hiring Manager Evaluation</h2>
                        <div className="space-y-8">
                            <div>
                                <strong className="text-gray-800 dark:text-gray-200 block mb-2 text-base">Summary:</strong> 
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-5 rounded-xl border border-blue-100 dark:border-blue-800/50 text-base text-blue-800 dark:text-blue-200 leading-relaxed whitespace-pre-wrap">{summary}</div>
                            </div>
                            <div>
                                <strong className="text-gray-800 dark:text-gray-200 block mb-2 text-base">Role Fit:</strong> 
                                <div className="bg-gray-50 dark:bg-black/20 p-4 rounded-xl border border-gray-100 dark:border-white/5 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{roleFit}</div>
                            </div>
                            <div>
                                <strong className="text-gray-800 dark:text-gray-200 block mb-2 text-base">Role Fit as per AI Interview:</strong> 
                                <div className="bg-gray-50 dark:bg-black/20 p-4 rounded-xl border border-gray-100 dark:border-white/5 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{communicationSkills}</div>
                            </div>
                            {keyStrength && (
                                <div>
                                    <strong className="text-gray-800 dark:text-gray-200 block mb-2 text-base">Key Strength:</strong> 
                                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-100 dark:border-green-800/50 text-sm text-green-800 dark:text-green-200 leading-relaxed whitespace-pre-wrap">{keyStrength}</div>
                                </div>
                            )}
                            {keyWeakness && (
                                <div>
                                    <strong className="text-gray-800 dark:text-gray-200 block mb-2 text-base">Key Weakness:</strong> 
                                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-800/50 text-sm text-red-800 dark:text-red-200 leading-relaxed whitespace-pre-wrap">{keyWeakness}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Professional Details Card */}
                    {submission.candidateInfo && (
                        <div className="bg-white dark:bg-white/5 rounded-2xl p-6 md:p-8 border border-gray-200 dark:border-white/10 shadow-sm">
                            <h2 className="text-xl font-bold mb-6 flex items-center gap-3"><Briefcase size={24} className="text-primary"/> Professional Details</h2>
                            {submission.candidateInfo.isFresher ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                    <Briefcase size={32} className="text-gray-300 dark:text-gray-600 mb-3" />
                                    <span className="text-base font-semibold text-gray-500 dark:text-gray-400">Candidate is a Fresher</span>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="flex flex-col p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Total Experience</span>
                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{submission.candidateInfo.totalExperienceYears}y {submission.candidateInfo.totalExperienceMonths}m</span>
                                    </div>
                                    <div className="flex flex-col p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Company</span>
                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate" title={submission.candidateInfo.currentCompanyName || 'N/A'}>{submission.candidateInfo.currentCompanyName || 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Designation</span>
                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate" title={submission.candidateInfo.designation || 'N/A'}>{submission.candidateInfo.designation || 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Current Salary</span>
                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{submission.candidateInfo.currentSalary || 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notice Period</span>
                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{submission.candidateInfo.noticePeriodDays ? `${submission.candidateInfo.noticePeriodDays} Days` : 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Reason for job change</span>
                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate" title={submission.candidateInfo.reasonForJobChange || 'N/A'}>{submission.candidateInfo.reasonForJobChange || 'N/A'}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                <div className={`space-y-6 ${isCompareMode ? '' : 'lg:col-span-1'}`}>
                    {/* Scores Card */}
                    <div className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-200 dark:border-white/10 shadow-sm">
                        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><CheckCircle size={20} className="text-primary"/> Performance Scores</h2>
                        <div className="flex justify-around items-center">
                            <ScoreCircle score={Number(getScoreValue(submission.resumeScore))} denom={Number(getScoreDenom(submission.resumeScore))} color={getScoreColorName(Number(getScoreValue(submission.resumeScore)), getScoreDenom(submission.resumeScore))} label="Resume" />
                            <ScoreCircle score={Number(getScoreValue(submission.qnaScore))} denom={Number(getScoreDenom(submission.qnaScore))} color={getScoreColorName(Number(getScoreValue(submission.qnaScore)), getScoreDenom(submission.qnaScore))} label="Q&A" />
                            <ScoreCircle score={Number(getScoreValue(submission.score))} denom={Number(getScoreDenom(submission.score))} color={getScoreColorName(Number(getScoreValue(submission.score)), getScoreDenom(submission.score))} label="Overall" />
                        </div>
                    </div>

                    {/* Candidate Details */}
                    {submission.candidateInfo && (
                        <div className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-200 dark:border-white/10 shadow-sm flex flex-col gap-4">
                            <h2 className="text-lg font-bold flex items-center gap-2"><User size={20} className="text-primary"/> Candidate Details</h2>
                            
                            {/* Personal Details */}
                            <div className="space-y-2">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Personal Details</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="flex flex-col p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Gender</span>
                                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{submission.candidateInfo.gender || 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">DOB</span>
                                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                            {submission.candidateInfo.dob ? new Date(submission.candidateInfo.dob).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric'}) : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="flex flex-col p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Age</span>
                                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{submission.candidateInfo.age || 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Marital Status</span>
                                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{submission.candidateInfo.maritalStatus || 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Current City</span>
                                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{submission.candidateInfo.currentCity || 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col col-span-2 p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Native Place</span>
                                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{submission.candidateInfo.nativePlace || 'N/A'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Qualifications */}
                            <div className="space-y-2 mt-2">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Qualifications</h3>
                                <div className="flex flex-col p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Basic Qualification</span>
                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{submission.candidateInfo.qualificationBasic || 'N/A'}</span>
                                </div>
                                {submission.candidateInfo.qualificationPG && (
                                    <div className="flex flex-col p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Post Graduation</span>
                                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{submission.candidateInfo.qualificationPG}</span>
                                    </div>
                                )}
                            </div>


                            {/* Additional Details */}
                            <div className="space-y-2 mt-2">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Additional Details</h3>
                                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                    <div className="flex items-center gap-3"><Award size={16} className="text-gray-400" /><span className="text-xs font-medium text-gray-500 dark:text-gray-400">Resume Updated?</span></div>
                                    <div className={`text-sm font-semibold capitalize ${submission.candidateInfo.resumeUpdated === 'Yes' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                                        {submission.candidateInfo.resumeUpdated || 'N/A'}
                                    </div>
                                </div>
                                {submission.candidateInfo.highlightedSkillsForJob && (
                                    <div className="p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-white/5">
                                        <div className="flex items-center gap-2 mb-1.5"><Brain size={16} className="text-gray-400" /><span className="text-xs font-medium text-gray-500 dark:text-gray-400">Highlighted Skills</span></div>
                                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-relaxed">
                                            {submission.candidateInfo.highlightedSkillsForJob}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Session Integrity Card */}
                    <div className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-200 dark:border-white/10 shadow-sm">
                        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Shield size={20} className="text-primary"/> Session Integrity</h2>
                        <div className="grid grid-cols-1 gap-4">
                            <BehavioralStat icon={<Shield size={20}/>} label="Tab Switches" value={submission.meta?.tabSwitchCount ?? 0} color={submission.meta?.tabSwitchCount && submission.meta.tabSwitchCount > 0 ? 'red' : 'green'} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Q&A Videos and Transcripts - Full Width */}
            <div className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-200 dark:border-white/10 shadow-sm">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-3"><Video size={20} className="text-primary"/> Question & Answer Insights</h2>
                <div className="space-y-6">
                    {submission.questions?.map((q, index) => (
                        <div key={index} className="flex flex-col lg:flex-row gap-6 p-5 bg-gray-50 dark:bg-black/20 rounded-2xl border border-gray-100 dark:border-white/5">
                            {/* Video side */}
                            <div className="w-full lg:w-80 flex-shrink-0 flex flex-col justify-between">
                                <p className="font-bold text-gray-900 dark:text-white mb-3 flex items-start gap-2">
                                    <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-md">Q{index + 1}</span> 
                                    <span>{q}</span>
                                </p>
                                {submission.videoURLs?.[index] ? (
                                    <div 
                                        className="relative group aspect-video bg-gray-900 rounded-xl overflow-hidden cursor-pointer shadow-md hover:shadow-lg transition-shadow"
                                        onClick={() => setActiveVideoIndex(index)}
                                    >
                                        <video src={submission.videoURLs[index]} className="w-full h-full object-cover opacity-70 group-hover:opacity-60 transition-opacity" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white group-hover:scale-110 transition-transform shadow-lg border border-white/30">
                                                <i className="fas fa-play ml-1 text-lg"></i>
                                            </div>
                                        </div>
                                        <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md">
                                            Play Recording
                                        </div>
                                    </div>
                                ) : (
                                    <div className="aspect-video bg-gray-200 dark:bg-white/5 rounded-xl flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700">
                                        <Video size={24} className="mb-2 opacity-50" />
                                        <p className="text-sm font-medium">No Recording</p>
                                    </div>
                                )}
                            </div>
                            {/* Q&A Side */}
                            <div className="flex-1 flex flex-col">
                                <div className="flex-1 bg-white dark:bg-white/5 rounded-xl p-4 border border-gray-200 dark:border-white/10 h-full flex flex-col">
                                    <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <FileText size={14} /> Transcript / Answer
                                    </h4>
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                            {submission.transcriptTexts?.[index] || 'Transcript not available for this question.'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {(!submission.questions || submission.questions.length === 0) && (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            No questions found for this interview submission.
                        </div>
                    )}
                </div>
            </div>
            
            </div> {/* End of Left Panel Wrapper */}

            {/* Sticky Compare Mode Resume Panel (Right Side) */}
            {isCompareMode && submission.candidateResumeURL && !submission.candidateResumeURL.startsWith('data:text/plain') && (
                <div className="w-full xl:w-1/2 xl:sticky xl:top-24 h-[80vh] xl:h-[calc(100vh-8rem)] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm bg-white dark:bg-[#111] overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5">
                        <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                            <FileText size={16} className="text-primary"/> Original Resume PDF
                        </h3>
                        <a href={submission.candidateResumeURL} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1.5 text-primary hover:underline font-medium px-3 py-1 bg-primary/10 rounded-lg ml-auto mr-3">
                            <i className="fas fa-external-link-alt"></i> Open Full
                        </a>
                        <button onClick={() => setIsCompareMode(false)} className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 dark:bg-white/10 text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors">&times;</button>
                    </div>
                    <div className="flex-1 w-full bg-gray-100 dark:bg-[#0a0a0a] relative">
                         <div className="absolute inset-0 flex flex-col items-center justify-center z-0 text-gray-400 dark:text-gray-500">
                             <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mb-3"></div>
                             <span className="text-sm">Loading document...</span>
                         </div>
                         <iframe src={submission.candidateResumeURL} className="absolute inset-0 w-full h-full border-none z-10" title="Resume Compare" />
                    </div>
                </div>
            )}
        </div>

        {/* Modals content follows */}
        
        {isResumeModalOpen && createPortal(
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setIsResumeModalOpen(false)}>
              <div className="bg-white dark:bg-[#111] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-white/10" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-white/10 bg-gray-50/50 dark:bg-white/5">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2"><User size={20} className="text-primary"/> Profile / Resume Data Used</h3>
                      <button onClick={() => setIsResumeModalOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-200 dark:bg-white/10 text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors">&times;</button>
                  </div>
                  <div className="p-6 overflow-y-auto bg-white dark:bg-transparent">
                      {profileTextData ? (() => {
                          const nameMatch = profileTextData.match(/Name:\s*(.+)/);
                          const emailMatch = profileTextData.match(/Email:\s*(.+)/);
                          const expMatch = profileTextData.match(/Experience:\s*(.+)/);
                          const skillsMatch = profileTextData.match(/Skills:\s*(.+)/);
                          
                          const pName = nameMatch ? nameMatch[1] : 'Unknown';
                          const pEmail = emailMatch ? emailMatch[1] : 'Unknown';
                          const pExp = expMatch ? expMatch[1] : '0 Years';
                          const pSkills = skillsMatch ? skillsMatch[1].split(',').map(s => s.trim()).filter(Boolean) : [];

                          return (
                           <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 p-6 rounded-2xl border border-blue-100/50 dark:border-blue-800/30 mb-4 shadow-inner relative overflow-hidden">
                               <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 dark:bg-blue-400/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                               <div className="relative z-10 flex items-center justify-between mb-6">
                                   <p className="text-xs font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 flex items-center gap-2 bg-blue-100/50 dark:bg-blue-900/30 py-1.5 px-3 rounded-full w-max">
                                       <i className="fas fa-magic"></i> Auto-Generated AI Profile
                                   </p>
                               </div>
                               
                               <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6 mb-8">
                                   <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-blue-500/30">
                                       {pName.charAt(0).toUpperCase()}
                                   </div>
                                   <div>
                                       <h4 className="text-2xl font-black text-gray-900 dark:text-white mb-1">{pName}</h4>
                                       <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2 text-sm"><i className="fas fa-envelope text-blue-500"></i> {pEmail}</p>
                                   </div>
                               </div>

                               <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/60 dark:bg-[#111]/60 backdrop-blur-md p-5 rounded-xl border border-white/40 dark:border-white/5">
                                   <div>
                                       <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Experience</p>
                                       <p className="font-semibold text-gray-800 dark:text-gray-200 text-lg flex items-center gap-2">
                                           <i className="fas fa-briefcase text-indigo-500"></i> {pExp}
                                       </p>
                                   </div>
                                   <div>
                                       <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Top Skills</p>
                                       <div className="flex flex-wrap gap-2">
                                           {pSkills.map((skill, i) => (
                                               <span key={i} className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg shadow-sm">
                                                   {skill}
                                               </span>
                                           ))}
                                       </div>
                                   </div>
                               </div>
                           </div>
                          );
                      })() : submission.candidateResumeURL ? (
                          <div className="flex flex-col gap-3">
                              <div className="flex justify-between items-center px-1">
                                  <h4 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2"><FileText size={16} className="text-primary"/> Original Resume Document</h4>
                                  <a href={submission.candidateResumeURL} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1.5 text-primary hover:underline font-medium px-3 py-1.5 bg-primary/10 rounded-lg">
                                      <i className="fas fa-external-link-alt"></i> Open in New Tab
                                  </a>
                              </div>
                              <div className="w-full h-[65vh] rounded-xl overflow-hidden border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-black/20 relative shadow-inner">
                                  <div className="absolute inset-0 flex flex-col items-center justify-center z-0 text-gray-400 dark:text-gray-500">
                                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mb-3"></div>
                                      <span className="text-sm">Loading document...</span>
                                  </div>
                                  <iframe 
                                      src={submission.candidateResumeURL}
                                      title="Candidate Resume"
                                      className="w-full h-full border-none absolute inset-0 z-10 bg-white"
                                  />
                              </div>
                          </div>
                      ) : (
                          <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-6 border border-gray-200 dark:border-white/10">
                            <h4 className="font-bold text-gray-900 dark:text-white mb-4">Extracted Resume Text</h4>
                            <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans custom-scrollbar overflow-y-auto max-h-[50vh]">{submission.candidateInfo?.resumeText || 'No resume data available.'}</pre>
                          </div>
                      )}
                  </div>
              </div>
          </div>,
          document.body
        )}

        {activeVideoIndex !== null && createPortal(
            <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[100] p-4 md:p-8" onClick={() => setActiveVideoIndex(null)}>
                <div 
                    className={`bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ${showResumeInVideo ? 'w-full max-w-[95vw] h-[90vh]' : 'w-full max-w-5xl max-h-[90vh]'}`} 
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex justify-between items-center bg-white/5 p-4 border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-4">
                            <h3 className="text-white font-semibold flex items-center gap-2">
                                <Video size={18} className="text-primary"/> 
                                Question {activeVideoIndex + 1} of {submission.questions?.length || 0}
                            </h3>
                            {submission.candidateResumeURL && (
                                <button 
                                    onClick={() => setShowResumeInVideo(!showResumeInVideo)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border flex items-center gap-2 ${showResumeInVideo ? 'bg-primary/20 text-primary border-primary/30' : 'bg-white/10 text-gray-300 border-white/10 hover:bg-white/20'}`}
                                >
                                    <FileText size={14} /> {showResumeInVideo ? 'Hide Resume' : 'View Resume'}
                                </button>
                            )}
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 mr-4 border-r border-white/10 pr-4">
                                <button 
                                    disabled={activeVideoIndex === 0}
                                    onClick={() => setActiveVideoIndex(prev => prev !== null && prev > 0 ? prev - 1 : prev)}
                                    className="px-3 py-1.5 bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                                >
                                    <ArrowLeft size={14} /> Prev
                                </button>
                                <button 
                                    disabled={activeVideoIndex === (submission.questions?.length || 1) - 1}
                                    onClick={() => setActiveVideoIndex(prev => prev !== null && prev < (submission.questions?.length || 1) - 1 ? prev + 1 : prev)}
                                    className="px-3 py-1.5 bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                                >
                                    Next <ArrowLeft size={14} className="rotate-180" />
                                </button>
                            </div>
                            <button onClick={() => setActiveVideoIndex(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-red-500/20 hover:text-red-400 transition-colors">&times;</button>
                        </div>
                    </div>
                    
                    {/* Body */}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Resume Panel (Left) */}
                        {showResumeInVideo && (
                            <div className="w-1/2 border-r border-white/10 flex flex-col bg-white/5">
                                {submission.candidateResumeURL && !submission.candidateResumeURL.startsWith('data:text/plain') ? (
                                    <iframe src={submission.candidateResumeURL} className="w-full h-full border-none bg-white" title="Resume Document" />
                                ) : (
                                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                                        <h4 className="font-bold text-white mb-4">Extracted Resume Text</h4>
                                        <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans">{submission.candidateInfo?.resumeText || 'No resume data available.'}</pre>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Video & Q&A Panel (Right) */}
                        <div className={`${showResumeInVideo ? 'w-1/2' : 'w-full'} flex flex-col bg-black overflow-y-auto custom-scrollbar`}>
                            {/* Video Player */}
                            <div className="w-full aspect-video bg-black shrink-0 relative border-b border-white/10">
                                {submission.videoURLs?.[activeVideoIndex] ? (
                                    <video
                                        key={submission.videoURLs[activeVideoIndex]} // Force re-render on source change
                                        controls
                                        autoPlay
                                        src={submission.videoURLs[activeVideoIndex]}
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                                        <Video size={48} className="mb-4 opacity-50" />
                                        <p className="text-lg font-medium text-gray-400">No Recording Available</p>
                                        <p className="text-sm mt-2">The candidate did not record a video for this question.</p>
                                    </div>
                                )}
                            </div>
                            
                            {/* Q&A Content */}
                            <div className="flex-1 p-6 flex flex-col gap-6">
                                <div>
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Brain size={14} /> Question Asked
                                    </h4>
                                    <p className="text-lg font-semibold text-gray-200">
                                        {submission.questions?.[activeVideoIndex] || 'Unknown Question'}
                                    </p>
                                </div>
                                
                                <div className="flex-1 bg-white/5 rounded-xl p-5 border border-white/10">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <FileText size={14} /> AI Transcript / Answer
                                    </h4>
                                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                                        {submission.transcriptTexts?.[activeVideoIndex] || 'Transcript not available for this question.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>, document.body
        )}
    </div>
  );
};

export default InterviewReport;
