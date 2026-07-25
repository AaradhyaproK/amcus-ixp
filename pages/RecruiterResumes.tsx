import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, addDoc, deleteDoc, onSnapshot, query, where, serverTimestamp, getDoc, setDoc, updateDoc, arrayUnion, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { uploadToCloudinary } from '../services/api';
import { extractTextFromPdf } from './pdfUtils';
import { grokGenerateText } from '../services/grokService';
import { sendInterviewInvitations } from '../services/brevoService';
import { sendBulkWhatsAppInvitations } from '../services/wasenderService';
import { useMessageBox } from '../components/MessageBox';
import gsap from 'gsap';

interface CandidateProfile {
  id: string;
  recruiterUID: string;
  name: string;
  email: string;
  phone: string;
  skills: string[];
  experienceYears: number;
  summary: string;
  resumeUrl: string;
  fileName: string;
  createdAt: any;
  isActive?: boolean;
}

interface JobRecord {
  id: string;
  title: string;
  description: string;
  skills?: string;
  experience?: number;
  minExperience?: number;
  maxExperience?: number;
  accessCode?: string;
  interviewLink?: string;
}

interface Recommendation {
  candidateId: string;
  score: number;
  skillsMatch: string[];
  missingSkills: string[];
  experienceFit: string; // 'Fits', 'Underqualified', 'Overqualified'
}

const RecruiterResumes: React.FC = () => {
  const { user } = useAuth();
  const messageBox = useMessageBox();

  const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
  const [jobDocs, setJobDocs] = useState<any[]>([]);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [minExpFilter, setMinExpFilter] = useState<number>(0);

  // Uploading State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // Selected Job for Matchmaker
  const [selectedJobId, setSelectedJobId] = useState<string>('');

  // AI Fit Evaluations Cash (candidateId_jobId -> { assessment: string, status: string, loading: boolean })
  const [aiEvaluations, setAiEvaluations] = useState<Record<string, { assessment: string; status: string; loading: boolean }>>({});

  // Invitation & Selection State
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [isInviting, setIsInviting] = useState(false);

  // Combine Job Posts and Interviews
  const jobs = useMemo<JobRecord[]>(() => {
    const jobMap = new Map<string, JobRecord>();

    jobDocs.forEach((job) => {
      jobMap.set(job.id, {
        id: job.id,
        title: job.title || 'Untitled Role',
        description: job.description || '',
        skills: job.skills || '',
        experience: job.experience || 0,
        minExperience: job.minExperience !== undefined ? job.minExperience : job.experience || 0,
        maxExperience: job.maxExperience !== undefined ? job.maxExperience : job.experience || 0,
        accessCode: job.accessCode || '',
        interviewLink: job.interviewLink || '',
      });
    });

    interviews.forEach((interview) => {
      const existingEntry = jobMap.get(interview.id);
      const title = interview.title?.replace(/\s+Interview$/i, '').trim() || 'Untitled Role';

      jobMap.set(interview.id, {
        id: interview.id,
        title: existingEntry?.title || title,
        description: interview.description || existingEntry?.description || '',
        skills: interview.skills || existingEntry?.skills || '',
        experience: interview.experience || existingEntry?.experience || 0,
        minExperience: interview.minExperience !== undefined ? interview.minExperience : (existingEntry?.minExperience !== undefined ? existingEntry.minExperience : interview.experience || 0),
        maxExperience: interview.maxExperience !== undefined ? interview.maxExperience : (existingEntry?.maxExperience !== undefined ? existingEntry.maxExperience : interview.experience || 0),
        accessCode: interview.accessCode || existingEntry?.accessCode || '',
        interviewLink: interview.interviewLink || existingEntry?.interviewLink || '',
      });
    });

    return Array.from(jobMap.values());
  }, [jobDocs, interviews]);

  // Selection handlers
  const handleSelectCandidate = (candidateId: string) => {
    setSelectedCandidates((prev) =>
      prev.includes(candidateId) ? prev.filter((id) => id !== candidateId) : [...prev, candidateId]
    );
  };

  const handleToggleSelectAll = (candidatesList: Array<{ id: string }>) => {
    const listIds = candidatesList.map((c) => c.id);
    const allSelected = listIds.every((id) => selectedCandidates.includes(id));

    if (allSelected) {
      setSelectedCandidates((prev) => prev.filter((id) => !listIds.includes(id)));
    } else {
      setSelectedCandidates((prev) => Array.from(new Set([...prev, ...listIds])));
    }
  };

  const handleSendInvites = async () => {
    if (selectedCandidates.length === 0) {
      messageBox.showError('Please select at least one candidate.');
      return;
    }

    if (!selectedJobId) {
      messageBox.showError('Please select a Job Post to invite candidates to.');
      return;
    }

    const job = jobs.find((j) => j.id === selectedJobId);
    if (!job) {
      messageBox.showError('Selected job not found.');
      return;
    }

    const selectedProfiles = candidates.filter((c) => selectedCandidates.includes(c.id));
    const emailsToSend = selectedProfiles.map((c) => c.email).filter((e) => e);

    if (emailsToSend.length === 0) {
      messageBox.showError('None of the selected candidates have a valid email address.');
      return;
    }

    setIsInviting(true);
    try {
      const link = job.interviewLink || `${window.location.origin}/#/interview/${job.id}`;
      const code = job.accessCode || '';

      // 1. Send invitations via Brevo
      const mailResult = await sendInterviewInvitations(
        emailsToSend,
        job.title,
        link,
        code
      );

      if (!mailResult.success) {
        throw new Error(mailResult.error || 'Failed to send emails.');
      }

      // 2. Send WhatsApp invitations via WasenderAPI for candidates with valid phone numbers
      const candidatesWithPhones = selectedProfiles.filter((c) => c.phone && c.phone.trim() !== '' && c.phone !== 'N/A');
      let waCount = 0;
      if (candidatesWithPhones.length > 0) {
        const waResult = await sendBulkWhatsAppInvitations(
          candidatesWithPhones.map((c) => ({ phone: c.phone, name: c.name, email: c.email })),
          job.title,
          link,
          code
        );
        waCount = waResult.successCount;
      }

      // 3. Update/create the interview document in Firestore
      const interviewRef = doc(db, 'interviews', job.id);
      const interviewSnap = await getDoc(interviewRef);

      if (interviewSnap.exists()) {
        await updateDoc(interviewRef, {
          candidateEmails: arrayUnion(...emailsToSend)
        });
      } else {
        await setDoc(interviewRef, {
          title: job.title,
          description: job.description,
          skills: job.skills || '',
          candidateEmails: emailsToSend,
          accessCode: code || Math.random().toString(36).substring(2, 8).toUpperCase(),
          interviewLink: link,
          recruiterUID: user.uid,
          createdAt: serverTimestamp(),
          isMock: false,
        });
      }

      messageBox.showSuccess(`Successfully sent ${mailResult.totalEmails} email(s)${waCount > 0 ? ` & ${waCount} WhatsApp invite(s)` : ''}!`);
      setSelectedCandidates([]); // Clear selection
    } catch (err: any) {
      console.error('Error sending invitations:', err);
      messageBox.showError(`Failed to send invitations: ${err.message || ''}`);
    } finally {
      setIsInviting(false);
    }
  };

  // GSAP Animations
  useEffect(() => {
    if (loadingCandidates || loadingJobs) return;
    const ctx = gsap.context(() => {
      gsap.from('.resumes-header', {
        y: -20,
        opacity: 0,
        duration: 0.6,
        ease: 'power3.out',
      });
      gsap.from('.uploader-card', {
        x: -30,
        opacity: 0,
        duration: 0.6,
        delay: 0.2,
        ease: 'power2.out',
      });
      gsap.from('.matchmaker-card', {
        x: 30,
        opacity: 0,
        duration: 0.6,
        delay: 0.2,
        ease: 'power2.out',
      });
      gsap.from('.candidates-list-card', {
        y: 30,
        opacity: 0,
        duration: 0.7,
        delay: 0.4,
        ease: 'power3.out',
      });
    });
    return () => ctx.revert();
  }, [loadingCandidates, loadingJobs]);

  // Sync Candidates from Firestore
  useEffect(() => {
    if (!user) return;
    setLoadingCandidates(true);
    const qResumes = query(collection(db, 'candidateResumes'), where('recruiterUID', '==', user.uid));
    const unsubscribe = onSnapshot(
      qResumes,
      (snapshot) => {
        const records = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as CandidateProfile[];
        // Sort by creation date
        records.sort((a, b) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tB - tA;
        });
        setCandidates(records);
        setLoadingCandidates(false);
      },
      (err) => {
        console.error('Error loading resumes:', err);
        setLoadingCandidates(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // Sync Jobs and Interviews for Matchmaker
  useEffect(() => {
    if (!user) return;
    setLoadingJobs(true);

    const jobsQuery = query(collection(db, 'jobs'), where('recruiterUID', '==', user.uid));
    const interviewsQuery = query(collection(db, 'interviews'), where('recruiterUID', '==', user.uid));

    let unsubJobs = () => {};
    let unsubInterviews = () => {};

    let jobsLoaded = false;
    let interviewsLoaded = false;

    const checkLoading = () => {
      if (jobsLoaded && interviewsLoaded) {
        setLoadingJobs(false);
      }
    };

    unsubJobs = onSnapshot(
      jobsQuery,
      (snapshot) => {
        const records = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setJobDocs(records);
        jobsLoaded = true;
        checkLoading();
      },
      (err) => {
        console.error('Error loading jobs:', err);
        jobsLoaded = true;
        checkLoading();
      }
    );

    unsubInterviews = onSnapshot(
      interviewsQuery,
      (snapshot) => {
        const records = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })).filter(doc => (doc as any).isMock !== true);
        setInterviews(records);
        interviewsLoaded = true;
        checkLoading();
      },
      (err) => {
        console.error('Error loading interviews:', err);
        interviewsLoaded = true;
        checkLoading();
      }
    );

    return () => {
      unsubJobs();
      unsubInterviews();
    };
  }, [user]);

  // Handle Resume Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!user) {
      messageBox.showError('You must be signed in to upload resumes.');
      return;
    }

    setIsUploading(true);
    setUploadProgress('Starting upload sequence...');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type !== 'application/pdf') {
        messageBox.showError(`Skipped ${file.name}. Only PDF files are supported.`);
        continue;
      }

      try {
        setUploadProgress(`[${i + 1}/${files.length}] Extracting text from ${file.name}...`);
        const extractedText = await extractTextFromPdf(file);

        // Extract and verify email from text BEFORE uploading and analyzing
        const emailMatch = extractedText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
        const parsedEmail = emailMatch ? emailMatch[1].trim().toLowerCase() : '';
        let existingDocId: string | null = null;
        let existingName = '';

        if (parsedEmail) {
          const qExist = query(
            collection(db, 'candidateResumes'),
            where('recruiterUID', '==', user.uid),
            where('email', '==', parsedEmail)
          );
          const existSnap = await getDocs(qExist);
          if (!existSnap.empty) {
            const existingDoc = existSnap.docs[0];
            const existingData = existingDoc.data();
            existingDocId = existingDoc.id;
            existingName = existingData.name || 'Unnamed';

            const confirmOverwrite = window.confirm(
              `A candidate with the email "${parsedEmail}" already exists (${existingName}). Do you want to overwrite their profile with this new resume?`
            );

            if (!confirmOverwrite) {
              setUploadProgress(`[${i + 1}/${files.length}] Skip duplicate email: ${parsedEmail}`);
              continue;
            }
          }
        }

        setUploadProgress(`[${i + 1}/${files.length}] Uploading ${file.name} to Cloudinary...`);
        const uploadResult = await uploadToCloudinary(file, 'auto');
        const resumeUrl = typeof uploadResult === 'string' ? uploadResult : uploadResult?.url;
        if (!resumeUrl) {
          throw new Error('Cloudinary did not return a valid URL.');
        }

        setUploadProgress(`[${i + 1}/${files.length}] AI Parsing resume skills & experience...`);
        const systemPrompt = 'You are an expert HR assistant. Parse the candidate\'s resume text and extract candidate details into a valid JSON object. Do not include markdown code block formatting like ```json in your response, just the raw JSON.';
        const userPrompt = `
Extract details from this resume text:
---
${extractedText.slice(0, 4500)}
---

Output format (MUST be valid JSON):
{
  "name": "Full name of candidate",
  "email": "Candidate email",
  "phone": "Candidate phone",
  "skills": ["Array of key skills, programming languages, technologies, tools, frameworks"],
  "experienceYears": number (Estimated total years of work experience as a integer. If none/entry level, output 0),
  "summary": "2-3 sentences professional profile summary of the candidate"
}
`;

        const aiResponse = await grokGenerateText(systemPrompt, userPrompt, 0.2);
        let cleanJson = aiResponse.trim();
        if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/```json/g, '').replace(/```/g, '').trim();
        }

        let parsedData = {
          name: file.name.replace('.pdf', ''),
          email: parsedEmail,
          phone: '',
          skills: [] as string[],
          experienceYears: 0,
          summary: 'Candidate profile details parsed from resume.',
        };

        try {
          parsedData = { ...parsedData, ...JSON.parse(cleanJson) };
        } catch (parseErr) {
          console.warn('Could not parse AI response JSON. Saving text fallback.', parseErr);
        }

        setUploadProgress(`[${i + 1}/${files.length}] Saving to Firestore database...`);
        const candidateData = {
          recruiterUID: user.uid,
          name: parsedData.name || file.name.replace('.pdf', ''),
          email: parsedEmail || parsedData.email?.trim().toLowerCase() || '',
          phone: parsedData.phone || '',
          skills: Array.isArray(parsedData.skills) ? parsedData.skills.map((s) => s.trim()) : [],
          experienceYears: typeof parsedData.experienceYears === 'number' ? parsedData.experienceYears : 0,
          summary: parsedData.summary || '',
          resumeUrl,
          fileName: file.name,
          createdAt: serverTimestamp(),
        };

        if (existingDocId) {
          await setDoc(doc(db, 'candidateResumes', existingDocId), candidateData);
        } else {
          await addDoc(collection(db, 'candidateResumes'), candidateData);
        }
      } catch (err: any) {
        console.error(`Error processing resume ${file.name}:`, err);
        messageBox.showError(`Failed to process resume: ${file.name}. ${err.message || ''}`);
      }
    }

    setIsUploading(false);
    setUploadProgress('');
    messageBox.showSuccess('All resumes processed and saved successfully.');
  };

  // Delete Candidate
  const handleDeleteCandidate = (candidateId: string, name: string) => {
    messageBox.showConfirm(`Are you sure you want to delete candidate "${name}"?`, async () => {
      try {
        await deleteDoc(doc(db, 'candidateResumes', candidateId));
        messageBox.showSuccess('Candidate deleted successfully.');
      } catch (err) {
        console.error('Error deleting candidate:', err);
        messageBox.showError('Failed to delete candidate.');
      }
    });
  };

  const handleToggleActiveStatus = async (candidateId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'candidateResumes', candidateId), {
        isActive: !currentStatus
      });
      messageBox.showSuccess(`Candidate status updated successfully.`);
    } catch (err) {
      console.error('Error toggling candidate status:', err);
      messageBox.showError('Failed to update candidate status.');
    }
  };

  // Local/Real-Time Candidates Search
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      const searchLower = searchQuery.toLowerCase();
      const matchName = c.name?.toLowerCase().includes(searchLower);
      const matchEmail = c.email?.toLowerCase().includes(searchLower);
      const matchSkills = c.skills?.some((skill) => skill.toLowerCase().includes(searchLower));

      const matchSearch = searchQuery === '' || matchName || matchEmail || matchSkills;
      const matchExp = c.experienceYears >= minExpFilter;

      return matchSearch && matchExp;
    });
  }, [candidates, searchQuery, minExpFilter]);

  // Matchmaker calculations
  const matchmakerResults = useMemo(() => {
    if (!selectedJobId) return [];
    const job = jobs.find((j) => j.id === selectedJobId);
    if (!job) return [];

    const jobSkills = job.skills
      ? job.skills.split(',').map((s) => s.trim().toLowerCase()).filter((s) => s)
      : [];

    const minExp = job.minExperience !== undefined ? job.minExperience : (job.experience || 0);
    const maxExp = job.maxExperience !== undefined ? job.maxExperience : (job.experience || 99);

    return candidates
      .filter((c) => c.isActive !== false)
      .map((cand) => {
        const candSkillsLower = cand.skills.map((s) => s.toLowerCase());

      let matchingSkills: string[] = [];
      let missingSkills: string[] = [];

      jobSkills.forEach((jobSkill) => {
        const hasSkill = candSkillsLower.some((candSkill) => candSkill.includes(jobSkill) || jobSkill.includes(candSkill));
        if (hasSkill) {
          const originalSkillName = cand.skills.find(s => s.toLowerCase().includes(jobSkill)) || jobSkill;
          matchingSkills.push(originalSkillName);
        } else {
          missingSkills.push(jobSkill);
        }
      });

      const skillMatchScore = jobSkills.length > 0 ? (matchingSkills.length / jobSkills.length) * 100 : 80;

      let experienceScore = 100;
      let experienceFit: 'Fits' | 'Underqualified' | 'Overqualified' = 'Fits';

      if (cand.experienceYears < minExp) {
        experienceFit = 'Underqualified';
        const ratio = minExp > 0 ? cand.experienceYears / minExp : 1;
        experienceScore = ratio * 70;
      } else if (cand.experienceYears > maxExp) {
        experienceFit = 'Overqualified';
        experienceScore = 90;
      }

      const combinedScore = Math.round(0.7 * skillMatchScore + 0.3 * experienceScore);

      return {
        candidateId: cand.id,
        score: combinedScore,
        skillsMatch: matchingSkills,
        missingSkills,
        experienceFit,
      };
    })
    .sort((a, b) => b.score - a.score);
  }, [candidates, jobs, selectedJobId]);

  // AI Fit Recommendation generator
  const getAiRecommendation = async (candidate: CandidateProfile, job: JobRecord) => {
    const evalKey = `${candidate.id}_${job.id}`;
    if (aiEvaluations[evalKey]) return;

    setAiEvaluations((prev) => ({
      ...prev,
      [evalKey]: { assessment: '', status: '', loading: true },
    }));

    try {
      const systemPrompt = 'You are a premium AI recruitment consultant. Compare the candidate\'s profile against the job description and specify their recommendation status and a detailed fit assessment.';
      const userPrompt = `
Job Role: ${job.title}
Job Description: ${job.description}
Job Required Skills: ${job.skills || 'Not Specified'}
Required Experience: ${job.minExperience || 0} - ${job.maxExperience || 99} years

Candidate Profile:
- Name: ${candidate.name}
- Stated Experience: ${candidate.experienceYears} years
- Candidate Summary: ${candidate.summary}
- Extracted Candidate Skills: ${candidate.skills.join(', ')}

Evaluate this candidate. Provide:
1. A recommendation status: Choose exactly one of "Highly Recommended", "Recommended", "Needs Verification", or "Not Recommended".
2. A short paragraph (2-3 sentences) evaluating their overall fit, stating their direct advantages and highlighting potential gaps.
Output format: Return ONLY a valid JSON object matching this schema:
{
  "status": "Highly Recommended | Recommended | Needs Verification | Not Recommended",
  "assessment": "Evaluation assessment string..."
}
`;

      const aiResponse = await grokGenerateText(systemPrompt, userPrompt, 0.3);
      let cleanJson = aiResponse.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/```json/g, '').replace(/```/g, '').trim();
      }

      const parsedEval = JSON.parse(cleanJson);
      setAiEvaluations((prev) => ({
        ...prev,
        [evalKey]: {
          assessment: parsedEval.assessment || 'Failed to generate assessment content.',
          status: parsedEval.status || 'Needs Verification',
          loading: false,
        },
      }));
    } catch (err) {
      console.error('Error fetching AI recommendation:', err);
      setAiEvaluations((prev) => ({
        ...prev,
        [evalKey]: {
          assessment: 'Failed to fetch AI recommendation at this time. Please try again.',
          status: 'Error',
          loading: false,
        },
      }));
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Highly Recommended':
        return 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20';
      case 'Recommended':
        return 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20';
      case 'Needs Verification':
        return 'bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-500/20';
      case 'Not Recommended':
        return 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20';
      default:
        return 'bg-gray-100 dark:bg-gray-500/10 text-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-500/20';
    }
  };

  const loading = loadingCandidates || loadingJobs;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2 border-b border-gray-200 dark:border-white/5 resumes-header">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
            <i className="fas fa-file-invoice text-primary"></i> Resume Database & Matchmaker
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Store candidate resumes, search by coding skills, and automatically rank candidates for your active jobs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Card */}
        <div className="bg-white dark:bg-[#111] p-6 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm uploader-card">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <i className="fas fa-cloud-upload-alt text-blue-500"></i> Add New Resumes
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
            Drag and drop candidate resumes (PDF only). We will upload them to Cloudinary and run AI analysis to extract skills, experience, and profile summary automatically.
          </p>

          <label className={`w-full min-h-[160px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-white/[0.02] ${isUploading ? 'border-primary opacity-60 pointer-events-none' : 'border-gray-200 dark:border-white/10'}`}>
            <input
              type="file"
              accept=".pdf"
              multiple
              disabled={isUploading}
              onChange={handleFileUpload}
              className="hidden"
            />
            {isUploading ? (
              <>
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <i className="fas fa-spinner fa-spin text-xl text-primary"></i>
                </div>
                <p className="font-semibold text-gray-900 dark:text-white">AI Parsing in progress...</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 max-w-sm font-mono bg-muted/50 p-2 rounded-lg border border-border">
                  {uploadProgress}
                </p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-4 hover:scale-110 transition-transform">
                  <i className="fas fa-file-pdf text-xl"></i>
                </div>
                <p className="font-semibold text-gray-900 dark:text-white">Choose Files or Drag Here</p>
                <p className="text-xs text-gray-400 mt-1">Supports PDF up to 10MB</p>
              </>
            )}
          </label>
        </div>

        {/* Matchmaker Panel */}
        <div className="bg-white dark:bg-[#111] p-6 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm matchmaker-card flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <i className="fas fa-star text-yellow-500 animate-pulse"></i> Automated Matchmaker
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Select one of your job posts to find and match the perfect candidate instantly from your resume pool.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Select Job Post
                </label>
                {jobs.length === 0 ? (
                  <div className="text-sm text-gray-400 bg-gray-50 dark:bg-white/[0.02] p-4 rounded-xl border border-border">
                    No active job posts found. Create an interview or job post first.
                  </div>
                ) : (
                  <select
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary transition-colors text-gray-900 dark:text-white"
                  >
                    <option value="">-- Choose Job --</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title} {j.experience !== undefined ? `(${j.experience} Yrs)` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedJobId && (
                <div className="text-xs text-gray-500 bg-gray-50 dark:bg-white/[0.02] p-4 rounded-xl border border-border space-y-1.5">
                  <p className="font-semibold text-gray-700 dark:text-gray-300">
                    Job Specifications:
                  </p>
                  <p>
                    <span className="font-medium text-gray-800 dark:text-gray-200">Required Skills:</span>{' '}
                    {jobs.find((j) => j.id === selectedJobId)?.skills || 'None specified'}
                  </p>
                  <p>
                    <span className="font-medium text-gray-800 dark:text-gray-200">Experience Range:</span>{' '}
                    {(() => {
                      const j = jobs.find((job) => job.id === selectedJobId);
                      if (!j) return '';
                      const min = j.minExperience !== undefined ? j.minExperience : j.experience;
                      const max = j.maxExperience !== undefined ? j.maxExperience : j.experience;
                      return min === max ? `${min} years` : `${min} - ${max} years`;
                    })()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {selectedJobId && matchmakerResults.length === 0 && (
            <p className="text-xs text-gray-400 mt-4">
              Add candidates to the database below to generate recommendations.
            </p>
          )}
        </div>
      </div>

      {/* Matchmaker Recommendations Drawer */}
      {selectedJobId && matchmakerResults.length > 0 && (
        <div className="bg-white dark:bg-[#111] p-6 rounded-2xl border border-gray-200 dark:border-white/5 shadow-md space-y-6">
          <div className="border-b border-border pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fas fa-trophy text-yellow-500"></i> Best Candidate Recommendations
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Candidates in your database ranked by matching score against requirements.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 cursor-pointer select-none border border-border rounded-xl px-3 py-2 bg-muted">
                <input
                  type="checkbox"
                  checked={matchmakerResults.length > 0 && matchmakerResults.every((rec) => selectedCandidates.includes(rec.candidateId))}
                  onChange={() => handleToggleSelectAll(matchmakerResults.map(r => ({ id: r.candidateId })))}
                  className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300 dark:border-white/10 bg-muted cursor-pointer"
                />
                Select All
              </label>
              <button
                onClick={handleSendInvites}
                disabled={isInviting || selectedCandidates.length === 0}
                className="px-4 py-2 bg-primary hover:bg-primary-dark text-white dark:text-black font-semibold rounded-xl shadow-lg transition-all text-xs disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2"
              >
                {isInviting ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i> Inviting...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane"></i> Send Invite ({selectedCandidates.length})
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {matchmakerResults.map((rec, idx) => {
              const candidate = candidates.find((c) => c.id === rec.candidateId);
              const job = jobs.find((j) => j.id === selectedJobId);
              if (!candidate || !job) return null;

              const evalKey = `${candidate.id}_${job.id}`;
              const aiEval = aiEvaluations[evalKey];

              return (
                <div
                  key={candidate.id}
                  className="rounded-2xl border border-gray-200 dark:border-white/5 p-5 hover:border-gray-300 dark:hover:border-white/10 transition-all bg-gray-50/50 dark:bg-white/[0.01] flex items-start gap-4"
                >
                  <input
                    type="checkbox"
                    checked={selectedCandidates.includes(candidate.id)}
                    onChange={() => handleSelectCandidate(candidate.id)}
                    className="mt-1.5 w-4 h-4 rounded text-primary focus:ring-primary border-gray-300 dark:border-white/10 bg-muted cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-primary/20 text-primary font-bold text-xs flex items-center justify-center">
                            #{idx + 1}
                          </span>
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                            {candidate.name}
                          </h3>
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold border ${rec.score >= 80 ? 'bg-green-500/10 text-green-500 border-green-500/25' : rec.score >= 60 ? 'bg-blue-500/10 text-blue-500 border-blue-500/25' : 'bg-gray-500/10 text-gray-500 border-gray-500/25'}`}>
                            {rec.score}% Match Score
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {candidate.experienceYears} Years Stated Experience &bull; {candidate.email || 'No email'} &bull; {candidate.phone || 'No phone'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={candidate.resumeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 text-xs font-semibold bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-border rounded-xl transition-all shadow-sm"
                        >
                          <i className="fas fa-file-pdf text-red-500 mr-1.5"></i> Original Resume
                        </a>
                        <button
                          onClick={() => getAiRecommendation(candidate, job)}
                          disabled={aiEval?.loading}
                          className="px-4 py-2 text-xs font-semibold bg-primary hover:bg-primary-dark text-white dark:text-black rounded-xl transition-all shadow-md flex items-center gap-1.5"
                        >
                          {aiEval?.loading ? (
                            <>
                              <i className="fas fa-spinner fa-spin"></i> AI Evaluation...
                            </>
                          ) : aiEval?.assessment ? (
                            <>
                              <i className="fas fa-brain"></i> Show Assessment
                            </>
                          ) : (
                            <>
                              <i className="fas fa-magic"></i> AI Fit Evaluation
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Matching & Missing Skills Details */}
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-4 border-t border-border/60">
                      <div>
                        <p className="font-semibold text-green-600 dark:text-green-400 mb-1.5">
                          Matching Skills ({rec.skillsMatch.length})
                        </p>
                        {rec.skillsMatch.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {rec.skillsMatch.map((s, index) => (
                              <span key={index} className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20 text-[10px]">
                                {s}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">None matching</span>
                        )}
                      </div>

                      <div>
                        <p className="font-semibold text-red-500/80 dark:text-red-400/80 mb-1.5">
                          Missing Skills ({rec.missingSkills.length})
                        </p>
                        {rec.missingSkills.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {rec.missingSkills.map((s, index) => (
                              <span key={index} className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20 text-[10px]">
                                {s}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">No missing skills</span>
                        )}
                      </div>
                    </div>

                    {/* AI Fit Evaluation Box */}
                    {aiEval && (
                      <div className="mt-4 p-4 rounded-xl border border-border/80 bg-muted/40 relative overflow-hidden text-xs">
                        {aiEval.loading ? (
                          <div className="flex items-center gap-2 text-gray-500 py-2">
                            <i className="fas fa-spinner fa-spin text-primary"></i>
                            <span>Reading resume and analyzing role requirement alignments...</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-700 dark:text-gray-300">
                                AI Fit Recommendation:
                              </span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClass(aiEval.status)}`}>
                                {aiEval.status}
                              </span>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                              {aiEval.assessment}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Candidates List / Database View */}
      <div className="bg-white dark:bg-[#111] p-6 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm candidates-list-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Candidate Pool ({filteredCandidates.length})
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Search, filter, and view all parsed candidate profiles in your local database.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Select All */}
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 cursor-pointer select-none border border-border rounded-xl px-3 py-2 bg-muted">
              <input
                type="checkbox"
                checked={filteredCandidates.length > 0 && filteredCandidates.every((c) => selectedCandidates.includes(c.id))}
                onChange={() => handleToggleSelectAll(filteredCandidates)}
                className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300 dark:border-white/10 bg-muted cursor-pointer"
              />
              Select All
            </label>

            {/* Invite Button */}
            <button
              onClick={handleSendInvites}
              disabled={isInviting || selectedCandidates.length === 0}
              className="px-4 py-2 bg-primary hover:bg-primary-dark text-white dark:text-black font-semibold rounded-xl shadow-lg transition-all text-xs disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5"
            >
              {isInviting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
              Invite Selected ({selectedCandidates.length})
            </button>

            {/* Search Input */}
            <div className="relative">
              <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input
                type="text"
                placeholder="Search name, email, skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:border-primary transition-all w-[240px] text-gray-900 dark:text-white"
              />
            </div>

            {/* Experience Filter */}
            <div className="flex items-center gap-2 border border-border rounded-xl px-3 py-1.5 bg-muted">
              <span className="text-xs text-gray-500 font-medium">Min Experience:</span>
              <input
                type="number"
                min="0"
                max="20"
                value={minExpFilter}
                onChange={(e) => setMinExpFilter(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-10 bg-transparent border-none focus:outline-none text-xs font-bold text-center text-gray-900 dark:text-white"
              />
              <span className="text-xs text-gray-500">Yrs</span>
            </div>
          </div>
        </div>

        {filteredCandidates.length === 0 ? (
          <div className="text-center py-16 bg-gray-50/50 dark:bg-white/[0.01] rounded-2xl border border-gray-200 dark:border-white/5 border-dashed">
            <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800/50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
              <i className="fas fa-users-slash text-xl"></i>
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium">No candidates match your query</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              Try adjusting your search criteria, reducing your minimum experience limit, or uploading new PDF resumes above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredCandidates.map((c) => (
              <div
                key={c.id}
                className="p-5 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/10 transition-colors bg-gray-50/30 dark:bg-white/[0.005] group flex items-start gap-4"
              >
                <input
                  type="checkbox"
                  checked={selectedCandidates.includes(c.id)}
                  onChange={() => handleSelectCandidate(c.id)}
                  className="mt-1.5 w-4 h-4 rounded text-primary focus:ring-primary border-gray-300 dark:border-white/10 bg-muted cursor-pointer"
                />
                <div className="flex-1">
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                    <div className="space-y-3 flex-1">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-primary transition-colors">
                            {c.name}
                          </h3>
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[10px] font-semibold">
                            {c.experienceYears} Yrs Experience
                          </span>
                          {c.isActive !== false ? (
                            <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 text-[10px] font-semibold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-50 animate-pulse"></span> Active
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-[10px] font-semibold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span> Deactivated (Not Seeking)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">
                          {c.email || 'No Email'} &bull; {c.phone || 'No Phone'}
                        </p>
                      </div>

                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed bg-white dark:bg-[#151515] p-3 rounded-xl border border-border">
                        {c.summary}
                      </p>

                      <div className="flex flex-wrap gap-1.5">
                        {c.skills.map((skill, index) => (
                          <span
                            key={index}
                            className="px-2.5 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-[10px] font-medium transition-colors"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex md:flex-col items-center gap-2 self-stretch justify-between md:justify-start">
                      <a
                        href={c.resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-2 text-xs font-semibold bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-border rounded-xl transition-all shadow-sm flex items-center gap-1.5 w-full justify-center"
                        title="Download/Open Resume"
                      >
                        <i className="fas fa-file-pdf text-red-500"></i> View PDF
                      </a>
                      <button
                        onClick={() => handleToggleActiveStatus(c.id, c.isActive !== false)}
                        className={`w-full py-2.5 px-3.5 text-xs font-bold rounded-xl border transition-all flex items-center justify-between shadow-sm hover:scale-[1.02] active:scale-[0.98] focus:outline-none ${
                          c.isActive !== false 
                            ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:border-emerald-500/35 hover:shadow-emerald-500/5' 
                            : 'bg-gradient-to-r from-gray-500/5 to-zinc-500/5 text-gray-500 dark:text-zinc-400 border-border hover:border-gray-400/30'
                        }`}
                        title={c.isActive !== false ? "Deactivate candidate (exclude from job matching)" : "Activate candidate (include in job matching)"}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${c.isActive !== false ? 'bg-emerald-500 animate-pulse' : 'bg-gray-450 dark:bg-gray-600'}`}></span>
                          <span>{c.isActive !== false ? 'Job Seeking' : 'Inactive'}</span>
                        </div>
                        <div className={`relative w-7 h-4 rounded-full transition-colors ${c.isActive !== false ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${c.isActive !== false ? 'translate-x-3' : 'translate-x-0'}`}></span>
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeleteCandidate(c.id, c.name)}
                        className="px-3.5 py-2 text-xs font-semibold bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-xl transition-colors border border-red-200 dark:border-red-500/20 w-full flex items-center gap-1.5 justify-center"
                        title="Delete Candidate"
                      >
                        <i className="fas fa-trash"></i> Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecruiterResumes;
