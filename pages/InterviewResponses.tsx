import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { InterviewSubmission } from '../types';
import { useAuth } from '../context/AuthContext';

const InterviewResponses: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const [submissions, setSubmissions] = useState<InterviewSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [customScore, setCustomScore] = useState<number>(7);
  const [scoreOperator, setScoreOperator] = useState<'gte' | 'lte'>('gte');

  const { user, userProfile } = useAuth();

  useEffect(() => {
    if (!interviewId) return;

    const submissionsQuery = query(
      collection(db, 'interviews', interviewId, 'attempts'),
      orderBy('submittedAt', 'desc')
    );

    const unsubscribe = onSnapshot(submissionsQuery, (querySnapshot) => {
      const submissionsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InterviewSubmission));
      setSubmissions(submissionsData);
      setLoading(false);
    }, (err) => {
        console.error("Error fetching submissions:", err);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [interviewId]);

  const getScoreValue = (score: unknown): number => {
    let value = 0;
    let denominator = 10;

    if (typeof score === 'number') {
      value = score;
      denominator = score > 10 ? 100 : 10;
    } else if (typeof score === 'string') {
      const [rawValue, rawDenominator] = score.split('/');
      const parsedValue = parseFloat(rawValue);
      const parsedDenominator = parseFloat(rawDenominator);

      value = isNaN(parsedValue) ? 0 : parsedValue;
      denominator = !isNaN(parsedDenominator) && parsedDenominator > 0
        ? parsedDenominator
        : value > 10
          ? 100
          : 10;
    }

    return denominator === 10 ? value : (value / denominator) * 10;
  };

  const getScoreDenom = (): string => '10';

  const filteredAndSortedSubmissions = useMemo(() => {
    return submissions
      .filter(s => 
        s.candidateInfo?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.candidateInfo?.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        const scoreA = getScoreValue(a.score);
        const scoreB = getScoreValue(b.score);
        return sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB;
      });
  }, [submissions, searchTerm, sortOrder]);

  const handleSelectSubmission = (submissionId: string) => {
    setSelectedSubmissions(prev => 
        prev.includes(submissionId) 
            ? prev.filter(id => id !== submissionId)
            : [...prev, submissionId]
    );
  };

  const handleAutoSelect = (type: 'top10' | 'top20' | 'all' | 'none') => {
    const submittedCandidates = filteredAndSortedSubmissions.filter(s => s.submittedAt);
    switch (type) {
        case 'top10':
            setSelectedSubmissions(submittedCandidates.slice(0, 10).map(s => s.id));
            break;
        case 'top20':
            setSelectedSubmissions(submittedCandidates.slice(0, 20).map(s => s.id));
            break;
        case 'all':
            setSelectedSubmissions(submittedCandidates.map(s => s.id));
            break;
        case 'none':
            setSelectedSubmissions([]);
            break;
    }
  };

  const handleCustomScoreSelect = () => {
    const submittedCandidates = filteredAndSortedSubmissions.filter(s => s.submittedAt);
    if (scoreOperator === 'gte') {
        setSelectedSubmissions(submittedCandidates.filter(s => getScoreValue(s.score) >= customScore).map(s => s.id));
    } else {
        setSelectedSubmissions(submittedCandidates.filter(s => getScoreValue(s.score) <= customScore).map(s => s.id));
    }
  };

  const exportToCSV = () => {
    const submissionsToExport = filteredAndSortedSubmissions.filter(s => selectedSubmissions.includes(s.id));
    const jobNameForFile = submissionsToExport.length > 0 ? ((submissionsToExport[0] as any).jobTitle || "Job") : "Job";
    const safeJobNameFile = `${jobNameForFile}`.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 30);
    const headers = ["Job Name", "Candidate Name", "Contact", "Email", "Resume Link", "Overall Score", "Report Link"];
    
    const csvContent = [
      headers.join(","),
      ...submissionsToExport.map(sub => {
        const jobName = `"${((sub as any).jobTitle || "Unknown Role").replace(/"/g, '""')}"`;
        const name = `"${(sub.candidateInfo?.name || "Unknown").replace(/"/g, '""')}"`;
        const contact = `"${(sub.candidateInfo?.phone || "N/A").replace(/"/g, '""')}"`;
        const email = `"${(sub.candidateInfo?.email || "N/A").replace(/"/g, '""')}"`;
        const resumeURL = `"${(sub.candidateResumeURL || "N/A").replace(/"/g, '""')}"`;
        const score = `"${getScoreValue(sub.score).toFixed(0)}"`;
        const reportUrl = `"${window.location.origin}/#/report/${sub.interviewId}/${sub.id}"`;
        return [jobName, name, contact, email, resumeURL, score, reportUrl].join(",");
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Responses_${safeJobNameFile}_${interviewId}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleComposeMail = () => {
    if (selectedSubmissions.length === 0) {
        return;
    }

    const submissionsToExport = filteredAndSortedSubmissions.filter(s => selectedSubmissions.includes(s.id));
    if (submissionsToExport.length === 0) return;

    const jobTitle = (submissionsToExport[0] as any).jobTitle || "the role";
    const jobTitleWithId = `${jobTitle} - ${interviewId}`;

    const subject = `Resumes for ${jobTitleWithId}`;

    let body = `Dear Sir / Mam,\n\n`;
    body += `Greetings of the day from DSource Training & Placement Services!\n\n`;
    body += `I am sharing resumes of the following candidates for the post of ${jobTitleWithId}:\n\n`;

    submissionsToExport.forEach((sub, index) => {
        const info = sub.candidateInfo;
        const currentSalaryPM = info?.currentSalary ? Math.round((parseFloat(info.currentSalary) * 100000) / 12).toLocaleString('en-IN') : 'N/A';
        const expectedSalaryPM = info?.expectedSalary ? Math.round((parseFloat(info.expectedSalary) * 100000) / 12).toLocaleString('en-IN') : 'N/A';
        const reportUrl = `${window.location.origin}/#/report/${sub.interviewId}/${sub.id}`;
        
        body += `--- Candidate ${index + 1} ---\n`;
        body += `Name: ${info?.name || 'N/A'}\n`;
        body += `Email: ${info?.email || 'N/A'}\n`;
        body += `Phone: ${info?.phone || 'N/A'}\n`;
        body += `Overall Score: ${getScoreValue(sub.score).toFixed(1)}/10\n`;
        body += `Interview Availability: N/A\n`; // Placeholder as per example
        body += `Working Status: ${info?.workStatus === 'working' ? 'Working' : 'Not Working'}\n`;
        body += `Work Experience: ${info?.totalExperienceYears ? `${info.totalExperienceYears}y ${info.totalExperienceMonths || '0'}m` : 'N/A'}\n`;
        body += `Current Salary (PM): ₹${currentSalaryPM}\n`;
        body += `Expected Salary (PM): ₹${expectedSalaryPM}\n`;
        body += `Notice Period: N/A\n`; // Placeholder as per example
        body += `Resume Link: ${sub.candidateResumeURL || 'N/A'}\n`;
        body += `Report Link: ${reportUrl}\n`;
        body += `\n`; // Separator between candidates
    });

    body += `The candidates are made aware about the job profile, location & timing through the following link.\n`;
    
    const jobLink = `${window.location.origin}/#/interview/${interviewId}`;
    body += `The Job details shared with the candidates are on the following link:\n`;
    body += `Link: ${jobLink}\n\n`;

    // Recruiter details from AuthContext
    body += `Recruiter Name: ${userProfile?.fullname || 'Team DSource'}\n`;
    body += `Contact Number: ${userProfile?.phone || 'N/A'}\n`;
    body += `Email id: ${user?.email || 'N/A'}\n\n`;

    body += `Do let us know the interview schedule for the shortlisted candidates.\n\n`;
    body += `Thanks & Regards.`;

    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      window.location.href = mailtoLink;
    } catch (e) {
      console.error("Failed to open mail client", e);
    }
  };

  const parseFeedback = (feedback: unknown) => {
    if (typeof feedback !== 'string') return { resumeAnalysis: 'N/A', answerQuality: 'N/A', overallEvaluation: 'N/A' };
    const resumeMatch = feedback.match(/\*\*Resume Analysis:\*\*([\s\S]*?)(?=\*\*Answer Quality:\*\*|$)/);
    const qualityMatch = feedback.match(/\*\*Answer Quality:\*\*([\s\S]*?)(?=\*\*Overall Evaluation:\*\*|$)/);
    const evalMatch = feedback.match(/\*\*Overall Evaluation:\*\*([\s\S]*)/);
    return {
        resumeAnalysis: resumeMatch ? resumeMatch[1].trim() : 'N/A',
        answerQuality: qualityMatch ? qualityMatch[1].trim() : 'N/A',
        overallEvaluation: evalMatch ? evalMatch[1].trim() : 'N/A'
    };
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 p-4 md:p-8">
      <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-white/5">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Interview Responses</h1>
          <Link to="/recruiter/interviews" className="text-primary font-medium hover:underline">&larr; Back to Interviews</Link>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:flex-1 p-3 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-black/80 backdrop-blur-sm dark:text-white dark:placeholder-slate-500"
        />
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
          className="w-full md:w-auto p-3 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white dark:bg-black/80 backdrop-blur-sm dark:text-white cursor-pointer"
        >
          <option value="desc">Score: High to Low</option>
          <option value="asc">Score: Low to High</option>
        </select>
        <div className="flex gap-2">
          <button
            disabled={selectedSubmissions.length === 0}
            onClick={handleComposeMail}
            className="w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="fas fa-envelope"></i> Compose Mail
          </button>
          <button
            disabled={selectedSubmissions.length === 0}
            onClick={exportToCSV}
            className="w-full md:w-auto px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="fas fa-file-excel"></i> Export CSV {selectedSubmissions.length > 0 ? `(${selectedSubmissions.length})` : ''}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-100 dark:bg-slate-800/50 rounded-xl border border-gray-200 dark:border-slate-700">
        <span className="text-sm font-bold mr-2 text-gray-700 dark:text-gray-300">Auto-select:</span>
        <button onClick={() => handleAutoSelect('top10')} className="px-3 py-1 text-xs font-medium bg-white dark:bg-slate-700 rounded-md shadow-sm border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600">Top 10</button>
        <button onClick={() => handleAutoSelect('top20')} className="px-3 py-1 text-xs font-medium bg-white dark:bg-slate-700 rounded-md shadow-sm border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600">Top 20</button>
        
        <div className="flex items-center gap-1 bg-white dark:bg-slate-700 rounded-md shadow-sm border border-gray-200 dark:border-slate-600 p-0.5">
            <select 
                value={scoreOperator} 
                onChange={e => setScoreOperator(e.target.value as 'gte' | 'lte')}
                className="bg-transparent text-xs font-medium border-none focus:ring-0 h-full py-1 pl-2 pr-1 appearance-none dark:bg-slate-700"
            >
                <option value="gte">Score ≥</option>
                <option value="lte">Score ≤</option>
            </select>
            <input 
                type="number" 
                value={customScore}
                onChange={e => setCustomScore(Number(e.target.value))}
                className="w-12 text-center bg-gray-50 dark:bg-slate-600 border-x border-gray-200 dark:border-slate-500 text-xs font-bold h-full py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                min="0" max="10" step="0.5"
            />
            <button onClick={handleCustomScoreSelect} className="px-2 text-xs font-bold text-primary hover:bg-primary/10 rounded-sm h-full">
                Select
            </button>
        </div>

        <div className="flex-grow"></div>
        <button onClick={() => handleAutoSelect('all')} className="px-3 py-1 text-xs font-medium bg-white dark:bg-slate-700 rounded-md shadow-sm border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600">Select All</button>
        <button onClick={() => handleAutoSelect('none')} className="px-3 py-1 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md shadow-sm border border-red-200 dark:border-red-600 hover:bg-red-200 dark:hover:bg-red-800/50">Clear</button>
      </div>

      {filteredAndSortedSubmissions.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 border-dashed">
            <i className="fas fa-inbox text-4xl text-gray-400 mx-auto mb-4"></i>
            <p className="text-gray-500 dark:text-gray-400">{searchTerm ? 'No matching responses found.' : 'No responses have been submitted for this interview yet.'}</p>
        </div>
      ) : (
        <div className="space-y-6">
            {filteredAndSortedSubmissions.map(submission => {
                const isSelected = selectedSubmissions.includes(submission.id);
                return (
                  <div 
                    key={submission.id} 
                    className={`relative bg-white dark:bg-[#111] rounded-2xl border ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200 dark:border-white/5'} shadow-sm hover:shadow-md hover:border-primary/50 dark:hover:border-primary/50 transition-all duration-300`}
                  >
                      <div className="absolute top-6 left-6 z-10">
                          <input 
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSelectSubmission(submission.id)}
                              className="h-5 w-5 rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary dark:bg-gray-700"
                          />
                      </div>
                      <div className="p-6 pl-16">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                            <div>
                                <h3 className="font-bold text-xl text-gray-900 dark:text-white capitalize">{submission.candidateInfo?.name || 'Unknown Candidate'}</h3>
                                {submission.candidateInfo?.phone && (
                                  <div className="flex items-center gap-2 mt-1.5 text-sm text-gray-500 font-medium">
                                      <i className="fas fa-phone"></i> {submission.candidateInfo.phone}
                                  </div>
                                )}
                                {submission.candidateInfo?.email && (
                                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 font-medium">
                                      <i className="fas fa-envelope"></i> {submission.candidateInfo.email}
                                  </div>
                                )}
                                <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                                    <i className="fas fa-calendar-alt"></i> Submitted: {submission.submittedAt?.toDate ? submission.submittedAt.toDate().toLocaleString('en-GB') : 'N/A'}
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                              <div className="text-3xl font-black text-primary">{getScoreValue(submission.score).toFixed(1)}<span className="text-lg text-gray-400 font-medium">/{getScoreDenom(submission.score)}</span></div>
                              <span className="text-sm font-semibold uppercase tracking-wider text-gray-500 mt-1">Overall Score</span>
                            </div>
                        </div>
                        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-white/5 flex justify-end">
                            <Link to={`/report/${interviewId}/${submission.id}`} className="text-primary font-bold text-sm flex items-center gap-2 hover:gap-3 transition-all">
                                View Detailed Report <i className="fas fa-arrow-right"></i>
                            </Link>
                        </div>
                      </div>
                  </div>
                )
            })}
        </div>
    )}
</div>
  );
};

export default InterviewResponses;
