import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import { InterviewSubmission } from '../types';
import { createPortal } from 'react-dom';

const InterviewResponses: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const [submissions, setSubmissions] = useState<InterviewSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

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


  const exportToCSV = () => {
    const jobNameForFile = filteredAndSortedSubmissions.length > 0 ? ((filteredAndSortedSubmissions[0] as any).jobTitle || "Job") : "Job";
    const safeJobNameFile = `${jobNameForFile}`.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 30);
    const headers = ["Job Name", "Candidate Name", "Contact", "Email", "Resume Link", "Overall Score", "Report Link"];
    
    const csvContent = [
      headers.join(","),
      ...filteredAndSortedSubmissions.map(sub => {
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
        <button
          onClick={exportToCSV}
          className="w-full md:w-auto px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg focus:ring-2 focus:ring-green-500 font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shadow-sm"
        >
          <i className="fas fa-file-excel"></i> Export CSV
        </button>
      </div>

      {filteredAndSortedSubmissions.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 border-dashed">
            <i className="fas fa-inbox text-4xl text-gray-400 mx-auto mb-4"></i>
            <p className="text-gray-500 dark:text-gray-400">{searchTerm ? 'No matching responses found.' : 'No responses have been submitted for this interview yet.'}</p>
        </div>
      ) : (
        <div className="space-y-6">
            {filteredAndSortedSubmissions.map(submission => {
                return (
                  <Link 
                    to={`/report/${interviewId}/${submission.id}`}
                    key={submission.id} 
                    className="block bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm hover:shadow-md hover:border-primary/50 dark:hover:border-primary/50 transition-all duration-300"
                  >
                      <div className="p-6">
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
                            <span className="text-primary font-bold text-sm flex items-center gap-2 hover:gap-3 transition-all">
                                View Detailed Report <i className="fas fa-arrow-right"></i>
                            </span>
                        </div>
                      </div>
                  </Link>
                )
            })}
        </div>
    )}
</div>
  );
};

export default InterviewResponses;
