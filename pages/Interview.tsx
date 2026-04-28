import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, addDoc, collection, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { uploadToCloudinary, generateInterviewQuestions, requestTranscription, fetchTranscriptText, generateFeedback } from '../services/api';
import { speak } from '../lib/tts';
import { Interview, InterviewState } from '../types';
import { createPortal } from 'react-dom';
import { LanguageSelector } from './LanguageSelector';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import * as pdfjsLib from 'pdfjs-dist';

// Setup PDF.js worker to enable PDF parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// --- Types ---
type WizardStep = 'validating' | 'collect-info' | 'instructions' | 'setup' | 'interview' | 'processing' | 'finish';
type CandidateInfo = { 
  name: string; 
  email: string; 
  phone: string; 
  language: string;
  resumeUpdated: string;
  experienceType: string;
  graduationYear?: string;
  collegeName?: string;
  degree?: string;
  fieldOfStudy?: string;
  specialization?: string;
  branchSpecialization?: string;
  workStatus?: string;
  currentCompany?: string;
  pastCompany?: string;
  leaveDate?: string;
  currentLocation: string;
  readyToRelocate: string;
  relocateReason?: string;
  currentSalary: string;
  expectedSalary: string;
  hasSalaryProof: string;
  totalExperienceYears: string;
  totalExperienceMonths: string;
  highlightedSkillsForJob?: string;
};

// --- Sarvam AI Transcription Helper ---
const transcribeWithSarvam = async (audioBlob: Blob, languageCode: string): Promise<string> => {
  // IMPORTANT: Storing API keys on the client-side is a major security risk.
  // This should be moved to a secure backend environment in a production application.
  // The key is now read from environment variables.
  const SARVAM_API_KEY = import.meta.env.VITE_SARVAM_API_KEY;

  const langMap: { [key: string]: string } = {
      en: 'en-IN',
      hi: 'hi-IN',
      mr: 'mr-IN'
  };
  const apiLangCode = langMap[languageCode] || 'en-IN';

  const formData = new FormData();
  // NOTE: The Sarvam API might expect a specific audio format like WAV.
  // MediaRecorder in most browsers produces WebM or Ogg. This might require server-side conversion if the API doesn't support it.
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('language_code', apiLangCode);
  formData.append('model', 'saaras:v3');

  try {
      const response = await fetch('https://api.sarvam.ai/speech-to-text', {
          method: 'POST',
          headers: { 'api-subscription-key': SARVAM_API_KEY },
          body: formData
      });
      const data = await response.json();
      if (response.ok) return data.transcript || "No speech detected.";
      throw new Error(data.message || "API Error during transcription");
  } catch (err) { 
      console.error("Transcription fetch error:", err);
      return `Error: ${(err as Error).message}`;
  }
}

const parsePdfToText = async (fileOrBlob: File | Blob): Promise<string> => {
  const MAX_PDF_PAGES = 3;
  const MAX_PDF_TEXT_CHARS = 6000;

  try {
    const arrayBuffer = await fileOrBlob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    let fullText = '';
    const pagesToParse = Math.min(pdf.numPages, MAX_PDF_PAGES);

    for (let i = 1; i <= pagesToParse; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + ' ';

      if (fullText.length >= MAX_PDF_TEXT_CHARS) {
        break;
      }
    }

    return fullText.trim().slice(0, MAX_PDF_TEXT_CHARS);
  } catch (error) {
    console.error("PDF parsing error:", error);
    // Return empty string on failure, the base64 will be used as a fallback
    return '';
  }
};

const QUESTION_TIME_MS = 2 * 60 * 1000; // 2 minutes
const TRANSCRIPT_POLL_ATTEMPTS = 20;
const TRANSCRIPT_POLL_DELAY_MS = 3000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const extractResumeText = async (fileOrBlob: File | Blob): Promise<string> => {
  if (fileOrBlob.type === 'application/pdf') {
    return parsePdfToText(fileOrBlob);
  }

  if (fileOrBlob.type.startsWith('text/')) {
    return (await fileOrBlob.text()).slice(0, 6000);
  }

  return '';
};

const getBlobAsBase64 = (blob: Blob): Promise<string> => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  })
);

const getFileAsBase64 = (file: File): Promise<{ base64: string; url: string }> => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const url = reader.result as string;
      resolve({ base64: url.split(',')[1], url });
    };
    reader.onerror = error => reject(error);
  })
);

const getFullscreenElement = (): Element | null => {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };

  return doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || null;
};

// --- Component: Tic-Tac-Toe (Glassmorphic & Dark Mode) ---
const TicTacToe: React.FC = () => {
  const [board, setBoard] = useState<(string | null)[]>(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);

  const checkWinner = (squares: (string | null)[]) => {
    const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) return squares[a];
    }
    return null;
  };

  const handleClick = (i: number) => {
    if (winner || board[i] || !isXNext) return;
    const newBoard = [...board];
    newBoard[i] = 'X';
    setBoard(newBoard);
    setIsXNext(false);
    const w = checkWinner(newBoard);
    if (w) setWinner(w);
  };

  useEffect(() => {
    if (!isXNext && !winner) {
      const timer = setTimeout(() => {
        const available = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        if (available.length > 0) {
          const random = available[Math.floor(Math.random() * available.length)];
          const newBoard = [...board];
          newBoard[random as number] = 'O';
          setBoard(newBoard);
          setIsXNext(true);
          const w = checkWinner(newBoard);
          if (w) setWinner(w);
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isXNext, winner, board]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/90 backdrop-blur-md rounded-xl transition-all duration-300">
      <h3 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white mb-2 sm:mb-4">
        {winner ? (winner === 'X' ? 'You Won!' : 'AI Won!') : (isXNext ? 'Your Turn (X)' : 'AI Thinking...')}
      </h3>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-3 sm:mb-6">
        {board.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleClick(i)}
            disabled={!!cell || !!winner || !isXNext}
            className={`w-14 h-14 sm:w-20 sm:h-20 text-xl sm:text-3xl font-bold flex items-center justify-center rounded-lg sm:rounded-xl shadow-inner transition-all 
              ${cell === 'X' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400' :
                cell === 'O' ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400' :
                  'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700'}`}
          >
            {cell}
          </button>
        ))}
      </div>
      {winner ? (
        <button onClick={() => { setBoard(Array(9).fill(null)); setIsXNext(true); setWinner(null); }} className="bg-primary hover:bg-primary-dark text-white px-4 sm:px-6 py-2 rounded-lg font-bold shadow-lg transition-colors text-sm sm:text-base">
          Play Again
        </button>
      ) : (
        <p className="text-gray-500 dark:text-gray-400 animate-pulse font-medium text-xs sm:text-base">Uploading... Play while you wait!</p>
      )}
    </div>
  );
};

// --- Component: Candidate Info Form ---
const CandidateInfoForm: React.FC<{
  jobTitle?: string;
  onSubmit: (info: CandidateInfo, file: File | null, existingResumeUrl?: string, cloudinaryUrl?: string) => void;
  errorMsg: string | null;
  user: any;
  userProfile: any;
}> = ({ jobTitle, onSubmit, errorMsg: initialError, user, userProfile }) => {
  const [name, setName] = useState(userProfile?.fullname || userProfile?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [uploadedResumeUrl, setUploadedResumeUrl] = useState<string | null>(null);
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError);
  const { isDark } = useTheme();
  const [language, setLanguage] = useState('en');

  // Pre-interview questionnaire states
  const [resumeUpdated, setResumeUpdated] = useState('yes');
  const [experienceType, setExperienceType] = useState('fresher'); 
  const [graduationYear, setGraduationYear] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [degree, setDegree] = useState('');
  const [degreeOther, setDegreeOther] = useState('');
  const [fieldOfStudy, setFieldOfStudy] = useState('');
  const [fieldOfStudyOther, setFieldOfStudyOther] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [specializationOther, setSpecializationOther] = useState('');
  const [workStatus, setWorkStatus] = useState('working'); 
  const [currentCompany, setCurrentCompany] = useState('');
  const [pastCompany, setPastCompany] = useState('');
  const [leaveDate, setLeaveDate] = useState('');
  const [currentLocation, setCurrentLocation] = useState('');
  const [readyToRelocate, setReadyToRelocate] = useState('yes');
  const [relocateReason, setRelocateReason] = useState('');
  const [currentSalary, setCurrentSalary] = useState('');
  const [expectedSalary, setExpectedSalary] = useState('');
  const [hasSalaryProof, setHasSalaryProof] = useState('yes');
  const [totalExperienceYears, setTotalExperienceYears] = useState('');
  const [totalExperienceMonths, setTotalExperienceMonths] = useState('');
  const [highlightedSkillsForJob, setHighlightedSkillsForJob] = useState('');

  const existingResumeUrl = userProfile?.resumeURL || userProfile?.resumeUrl;

  useEffect(() => {
      setErrorMsg(initialError);
  }, [initialError]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) {
      setErrorMsg("Please fill in your name and email.");
      return;
    }
    if (!phone) {
      setErrorMsg("Please provide your contact number.");
      return;
    }
    if (!resumeFile && !uploadedResumeUrl && !existingResumeUrl && !userProfile) {
      setErrorMsg("Please upload your resume.");
      return;
    }

    if (isUploadingResume) {
      setErrorMsg("Please wait until the resume finishes uploading.");
      return;
    }

    // Questionnaire Validations
    if (experienceType === 'fresher') {
      const selectedDegree = degree === 'Other' ? degreeOther.trim() : degree;
      const selectedFieldOfStudy = fieldOfStudy === 'Other' ? fieldOfStudyOther.trim() : fieldOfStudy;
      const selectedSpecialization = specialization === 'Other' ? specializationOther.trim() : specialization;

      if (!graduationYear) {
        setErrorMsg("Please provide your graduation year.");
        return;
      }
      if (!collegeName || !selectedDegree || !selectedFieldOfStudy || !selectedSpecialization) {
        setErrorMsg("Please provide your college, degree, field of study, and specialization details.");
        return;
      }
    }
    if (experienceType === 'experienced') {
      if (workStatus === 'working' && !currentCompany) {
        setErrorMsg("Please provide your current company name.");
        return;
      }
      if (workStatus === 'not_working' && (!pastCompany || !leaveDate)) {
        setErrorMsg("Please provide your past company and the date you left.");
        return;
      }
      if (!totalExperienceYears || !totalExperienceMonths) {
        setErrorMsg("Please provide your total experience in years and months.");
        return;
      }
    }
    if (experienceType === 'experienced') {
      if (!currentLocation) {
          setErrorMsg("Please provide your current job location.");
          return;
      }
      if (!currentSalary || !expectedSalary) {
          setErrorMsg("Please provide your current and expected salary.");
          return;
      }
    }

    setErrorMsg(null);
    const selectedDegree = degree === 'Other' ? degreeOther.trim() : degree;
    const selectedFieldOfStudy = fieldOfStudy === 'Other' ? fieldOfStudyOther.trim() : fieldOfStudy;
    const selectedSpecialization = specialization === 'Other' ? specializationOther.trim() : specialization;

    onSubmit({ 
      name, email, phone, language,
      resumeUpdated, experienceType, graduationYear, collegeName, degree: selectedDegree, fieldOfStudy: selectedFieldOfStudy, specialization: selectedSpecialization, branchSpecialization: selectedSpecialization, workStatus, currentCompany, pastCompany, leaveDate,
      currentLocation, readyToRelocate, relocateReason, currentSalary, expectedSalary, hasSalaryProof,
      totalExperienceYears, totalExperienceMonths, highlightedSkillsForJob
    }, resumeFile, existingResumeUrl, uploadedResumeUrl || undefined);
  };

  return (
      <div className="w-11/12 md:max-w-2xl lg:max-w-3xl bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
        <div className="text-center mb-6">
          <div className="inline-block px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-full mb-3 border border-blue-100 dark:border-blue-800">
            Applying for: {jobTitle || 'AI Interview'}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Candidate Information</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Confirm your details to begin the AI interview.</p>
        </div>
        
        {userProfile && (
          <div className="mb-6 p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50 shadow-sm relative overflow-hidden">
             
             {/* Decorative Background Elements */}
             <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-2xl pointer-events-none"></div>
             
             <div className="flex items-center gap-3 mb-4">
               <div className="bg-blue-600 dark:bg-blue-500 text-white w-10 h-10 rounded-xl shadow-md flex items-center justify-center font-black text-lg">
                 {name.charAt(0).toUpperCase()}
               </div>
               <div>
                 <p className="text-sm text-blue-900 dark:text-blue-200 font-bold mb-0">Profile Auto-Loaded</p>
                 <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">The AI will use these details to tailor your interview</p>
               </div>
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
               <div className="bg-white/60 dark:bg-black/20 p-2.5 rounded-lg border border-blue-100/50 dark:border-white/5">
                 <p className="text-[10px] uppercase font-bold text-blue-500/80 dark:text-blue-400 mb-1">Stated Experience</p>
                 <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                   {userProfile.experience ? `${userProfile.experience} Years` : 'Fresher / 0 Years'}
                 </p>
               </div>
               
               <div className="bg-white/60 dark:bg-black/20 p-2.5 rounded-lg border border-blue-100/50 dark:border-white/5">
                 <p className="text-[10px] uppercase font-bold text-blue-500/80 dark:text-blue-400 mb-1">Top Skills</p>
                 <div className="flex flex-wrap gap-1">
                   {userProfile.skills && userProfile.skills.length > 0 ? (
                     userProfile.skills.slice(0, 3).map((skill: string, i: number) => (
                       <span key={i} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-800/40 text-[10px] rounded font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap">
                         {skill}
                       </span>
                     ))
                   ) : (
                     <span className="text-xs font-medium text-gray-500">Not specified</span>
                   )}
                   {userProfile.skills && userProfile.skills.length > 3 && (
                     <span className="text-[10px] text-gray-500 font-medium self-center">+{userProfile.skills.length - 3}</span>
                   )}
                 </div>
               </div>
             </div>
          </div>
        )}

        {errorMsg && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">{errorMsg}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Full Name <span className="text-red-500">*</span></label>
              <input type="text" placeholder="John Doe" required value={name} onChange={e => setName(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Email Address <span className="text-red-500">*</span></label>
              <input type="email" placeholder="Email Address" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Contact Number <span className="text-red-500">*</span></label>
            <input type="tel" required placeholder="Contact Number" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          <div className="bg-gray-50 dark:bg-gray-900/30 p-5 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider mb-3">Pre-Interview Details</h3>
            
            {/* Resume Verification */}
            <div>
               <label className="text-xs font-bold text-gray-500 block mb-1">Is your resume up to date?</label>
               <select value={resumeUpdated} onChange={e => setResumeUpdated(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                  <option value="yes">Yes, it is updated</option>
                  <option value="no">No, but I will update it later</option>
               </select>
            </div>
            
            {/* Experience Type */}
            <div className="grid grid-cols-2 md:grid-cols-2 gap-2 mt-2">
                <label className={`p-2 rounded-lg text-sm font-bold border transition-colors text-center cursor-pointer ${experienceType === 'fresher' ? 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ring-1 ring-blue-500' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}`}>
                    <input type="radio" name="experienceType" value="fresher" className="sr-only" checked={experienceType === 'fresher'} onChange={() => setExperienceType('fresher')} />
                    Fresher
                </label>
                <label className={`p-2 rounded-lg text-sm font-bold border transition-colors text-center cursor-pointer ${experienceType === 'experienced' ? 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ring-1 ring-blue-500' : 'bg-white border-gray-200 text-gray-500 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'}`}>
                    <input type="radio" name="experienceType" value="experienced" className="sr-only" checked={experienceType === 'experienced'} onChange={() => setExperienceType('experienced')} />
                    Experienced
                </label>
            </div>
            
            {/* Conditional Logic */}
            {experienceType === 'fresher' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                   <label className="text-xs font-bold text-gray-500 block mb-1 mt-2">Graduation Year <span className="text-red-500">*</span></label>
                   <input type="text" placeholder="e.g. 2024" required value={graduationYear} onChange={e => setGraduationYear(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-gray-500 block mb-1 mt-2">College Name <span className="text-red-500">*</span></label>
                   <input type="text" placeholder="e.g. ABC Institute of Technology" required value={collegeName} onChange={e => setCollegeName(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-gray-500 block mb-1">Degree <span className="text-red-500">*</span></label>
                  <select required value={degree} onChange={e => setDegree(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all duration-200">
                     <option value="" disabled>Select degree</option>
                    <option value="B.Tech / B.E">B.Tech / B.E</option>
                    <option value="B.Sc">B.Sc</option>
                    <option value="B.Com">B.Com</option>
                    <option value="BBA">BBA</option>
                    <option value="BA">BA</option>
                    <option value="Diploma">Diploma</option>
                     <option value="Other">Other</option>
                   </select>
                 </div>
                {degree === 'Other' && (
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Degree (Other) <span className="text-red-500">*</span></label>
                    <input type="text" required value={degreeOther} onChange={e => setDegreeOther(e.target.value)} placeholder="Type your degree" className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  </div>
                )}
                 <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1">Field of Study <span className="text-red-500">*</span></label>
                  <select required value={fieldOfStudy} onChange={e => setFieldOfStudy(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all duration-200">
                    <option value="" disabled>Select field of study</option>
                    <option value="Technology / Engineering">Technology / Engineering</option>
                    <option value="Science">Science</option>
                    <option value="Commerce">Commerce</option>
                    <option value="Business / Management">Business / Management</option>
                    <option value="Arts / Humanities">Arts / Humanities</option>
                     <option value="Other">Other</option>
                   </select>
                 </div>
                {fieldOfStudy === 'Other' && (
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Field of Study (Other) <span className="text-red-500">*</span></label>
                    <input type="text" required value={fieldOfStudyOther} onChange={e => setFieldOfStudyOther(e.target.value)} placeholder="Type your field of study" className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  </div>
                )}
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1">Specialization <span className="text-red-500">*</span></label>
                  <select required value={specialization} onChange={e => setSpecialization(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm transition-all duration-200">
                    <option value="" disabled>Select specialization</option>
                    <option value="Computer Science">Computer Science</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Artificial Intelligence / Machine Learning">Artificial Intelligence / Machine Learning</option>
                    <option value="Data Science">Data Science</option>
                    <option value="Electronics & Communication">Electronics & Communication</option>
                    <option value="Mechanical Engineering">Mechanical Engineering</option>
                    <option value="Civil Engineering">Civil Engineering</option>
                    <option value="Physics">Physics</option>
                    <option value="Chemistry">Chemistry</option>
                    <option value="Mathematics">Mathematics</option>
                    <option value="Biology">Biology</option>
                    <option value="Biotechnology">Biotechnology</option>
                    <option value="Accounting">Accounting</option>
                    <option value="Finance">Finance</option>
                    <option value="Banking">Banking</option>
                    <option value="Taxation">Taxation</option>
                    <option value="Economics">Economics</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Human Resources (HR)">Human Resources (HR)</option>
                    <option value="Operations">Operations</option>
                    <option value="International Business">International Business</option>
                    <option value="Psychology">Psychology</option>
                    <option value="Political Science">Political Science</option>
                    <option value="Sociology">Sociology</option>
                    <option value="History">History</option>
                    <option value="English Literature">English Literature</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                {specialization === 'Other' && (
                  <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">Specialization (Other) <span className="text-red-500">*</span></label>
                    <input type="text" required value={specializationOther} onChange={e => setSpecializationOther(e.target.value)} placeholder="Type your specialization" className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  </div>
                )}
              </div>
            )}
            
            {experienceType === 'experienced' && (
              <div className="space-y-4 border-l-2 border-blue-500/50 pl-4 mt-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">Total Experience <span className="text-red-500">*</span></label>
                      <div className="flex gap-2">
                         <input type="number" min="0" placeholder="Years" required value={totalExperienceYears} onChange={e => setTotalExperienceYears(e.target.value)} className="w-1/2 p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                         <input type="number" min="0" max="11" placeholder="Months" required value={totalExperienceMonths} onChange={e => setTotalExperienceMonths(e.target.value)} className="w-1/2 p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                      </div>
                   </div>
                   <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">Current Work Status <span className="text-red-500">*</span></label>
                      <select value={workStatus} onChange={e => setWorkStatus(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
                        <option value="working">Currently Working</option>
                        <option value="not_working">Not Working / On Break</option>
                      </select>
                   </div>
                 </div>
                 {workStatus === 'working' ? (
                   <div>
                     <label className="text-xs font-bold text-gray-500 block mb-1">Current Company Name <span className="text-red-500">*</span></label>
                     <input type="text" required value={currentCompany} onChange={e => setCurrentCompany(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                   </div>
                 ) : (
                   <div className="flex flex-col sm:flex-row gap-2">
                     <div className="w-full sm:w-1/2">
                       <label className="text-xs font-bold text-gray-500 block mb-1">Past Company Name <span className="text-red-500">*</span></label>
                       <input type="text" required value={pastCompany} onChange={e => setPastCompany(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                     </div>
                     <div className="w-full sm:w-1/2">
                       <label className="text-xs font-bold text-gray-500 block mb-1">Leave Date (MM/YYYY) <span className="text-red-500">*</span></label>
                       <input type="text" required placeholder="e.g. 05/2023" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                     </div>
                   </div>
                 )}
                 <div>
                   <label className="text-xs font-bold text-gray-500 block mb-1">Highlight skills as per job requirements (Optional)</label>
                   <textarea
                     value={highlightedSkillsForJob}
                     onChange={e => setHighlightedSkillsForJob(e.target.value)}
                     placeholder="e.g. React, Node.js, team leadership, client communication"
                     rows={3}
                     className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-y"
                   />
                 </div>
              </div>
            )}
            
            {experienceType === 'experienced' && (
              <>
                {/* Location */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                     <label className="text-xs font-bold text-gray-500 block mb-1">Current Job Location (City, State) <span className="text-red-500">*</span></label>
                     <input type="text" required value={currentLocation} onChange={e => setCurrentLocation(e.target.value)} placeholder="e.g. Mumbai, Maharashtra" className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                   </div>
                   <div>
                     <div className="flex gap-2 items-start h-full md:mt-6 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" id="ready_relocate" checked={readyToRelocate === 'yes'} onChange={e => setReadyToRelocate(e.target.checked ? 'yes' : 'no')} className="mt-1 w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 dark:border-gray-600" />
                        <div>
                           <label htmlFor="ready_relocate" className="font-medium cursor-pointer">I am ready to relocate if required</label>
                        </div>
                     </div>
                   </div>
                </div>
                {readyToRelocate === 'yes' && (
                  <div className="mt-2">
                     <label className="text-xs font-bold text-gray-500 block mb-1">Reason for Relocation</label>
                     <input type="text" placeholder="e.g. Seeking better opportunities, family reasons" value={relocateReason} onChange={e => setRelocateReason(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                  </div>
                )}
                
                {/* Salary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                   <div>
                     <label className="text-xs font-bold text-gray-500 block mb-1">Current Salary (LPA) <span className="text-red-500">*</span></label>
                     <input type="text" placeholder="e.g. 6.5" required value={currentSalary} onChange={e => setCurrentSalary(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                   </div>
                   <div>
                     <label className="text-xs font-bold text-gray-500 block mb-1">Expected Salary (LPA) <span className="text-red-500">*</span></label>
                     <input type="text" placeholder="e.g. 10.0" required value={expectedSalary} onChange={e => setExpectedSalary(e.target.value)} className="w-full p-2.5 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                   </div>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white dark:bg-gray-800/80 p-3 rounded-lg border border-gray-200 dark:border-gray-600 mt-4 gap-2">
                   <span className="text-xs font-bold text-gray-600 dark:text-gray-400">Do you have salary slips/bank statements to support your current salary?</span>
                   <div className="flex gap-2">
                     <button type="button" onClick={() => setHasSalaryProof('yes')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-xs font-bold transition-colors ${hasSalaryProof === 'yes' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400'}`}>Yes</button>
                     <button type="button" onClick={() => setHasSalaryProof('no')} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-xs font-bold transition-colors ${hasSalaryProof === 'no' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border border-red-200 dark:border-red-800' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400'}`}>No</button>
                   </div>
                </div>
              </>
            )}
          </div>
          
          {/* Hide Resume Upload entirely if the user is signed in (we use their Profile Box instead) */}
          {!userProfile && (
            <div className="bg-gray-50 dark:bg-gray-900/30 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Resume Data</label>
              <label
                htmlFor="resume-upload-input"
                className={`w-full font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 border cursor-pointer ${isUploadingResume ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-600 border-yellow-200' : uploadedResumeUrl ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-800/60'} ${isUploadingResume ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <i className={isUploadingResume ? "fas fa-spinner fa-spin" : uploadedResumeUrl ? "fas fa-check-circle" : "fas fa-cloud-upload-alt"}></i>
                <span>{isUploadingResume ? 'Uploading to Cloudinary...' : uploadedResumeUrl ? 'Resume Uploaded Successfully' : resumeFile ? resumeFile.name : 'Browser/Upload Resume PDF'}</span>
              </label>
              <input
                id="resume-upload-input"
                type="file"
                accept=".pdf"
                className="hidden"
                disabled={isUploadingResume}
                onChange={async (e) => {
                  if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    setResumeFile(file);
                    setIsUploadingResume(true);
                    try {
                      const url = await uploadToCloudinary(file, 'auto');
                      setUploadedResumeUrl(url);
                    } catch (err) {
                      setErrorMsg("Failed to immediately upload to Cloudinary. You can still proceed.");
                    } finally {
                      setIsUploadingResume(false);
                    }
                  }
                }}
              />
              
              {uploadedResumeUrl && (
                  <div className="mt-3 flex items-center justify-center flex-col">
                       <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Direct Cloudinary Link:</p>
                       <a href={uploadedResumeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline text-center truncate px-2 w-full flex items-center justify-center gap-1">
                           <i className="fas fa-external-link-alt py-1"></i> View Uploaded Resume
                       </a>
                  </div>
              )}
              <p className="text-xs text-gray-400 mt-3 text-center">Required for AI generated questions.</p>
              </div>
          )}

          {/* The label is now inside the LanguageSelector component */}
          <LanguageSelector selectedLanguage={language} onLanguageChange={setLanguage} className="pt-2" />

          <button type="submit" className="w-full bg-blue-600 text-white p-3.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all transform hover:-translate-y-0.5 mt-4">
            Proceed to Interview
          </button>
        </form>
      </div>
  );
};

// --- Main Wizard Component ---
const CandidateInterviewFlow: React.FC = () => {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, userProfile } = useAuth();

  // State
  const [step, setStep] = useState<WizardStep>('validating');
  const [interview, setInterview] = useState<Interview | null>(null);
  const [candidateInfo, setCandidateInfo] = useState<CandidateInfo>({ name: '', email: '', phone: '', language: 'en' });
  const [interviewState, setInterviewState] = useState<InterviewState>({
    jobId: '', jobTitle: '', jobDescription: '', candidateResumeURL: null, candidateResumeMimeType: null,
    questions: [], answers: [], videoURLs: [], transcriptIds: [], transcriptTexts: [], currentQuestionIndex: 0,
    language: 'en',
    pendingResponseCount: 0,
  });

  const [loadingMsg, setLoadingMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [tabSwitches, setTabSwitches] = useState(0);
  const [speedStatus, setSpeedStatus] = useState<string | null>(null);
  const [interviewTerminated, setInterviewTerminated] = useState(false);

  // 1. Validate Access & Fetch Interview Details
  useEffect(() => {
    const validateAndInit = async () => {
      if (!interviewId) {
        setErrorMsg("Interview ID not found in URL.");
        setStep('collect-info'); // Fallback to show error
        return;
      }
      try {
        const interviewDocRef = doc(db, 'interviews', interviewId);
        const interviewDoc = await getDoc(interviewDocRef);

        if (!interviewDoc.exists()) {
          throw new Error("This interview does not exist or has been closed.");
        }
        
        const interviewData = { id: interviewDoc.id, ...interviewDoc.data() } as any;

        // Check if this interview requires a token (i.e., it's a post-assessment interview)
        const requiresToken = interviewData.requiresToken === true;
        const token = searchParams.get('token');

        if (requiresToken) {
          if (!token) {
            throw new Error("A valid access token is required for this interview. Please use the link from your email.");
          }

          const tokenDocRef = doc(db, 'interviewAccessTokens', token);
          const tokenDoc = await getDoc(tokenDocRef);

          if (!tokenDoc.exists()) {
            throw new Error("Invalid or expired interview link. Please check the link from your email.");
          }

          const tokenData = tokenDoc.data();
          if (tokenData.isUsed) {
            throw new Error("This interview link has already been used. Please contact the recruiter if you believe this is an error.");
          }

          if (tokenData.nextInterviewId !== interviewId) {
            throw new Error("This interview link is not valid for this job. Please check you are using the correct link.");
          }

          // Access granted. Mark token as used.
          await updateDoc(tokenDocRef, { isUsed: true, usedAt: serverTimestamp() });
        }

        // If we reach here, access is granted. Now load the interview data.
        const jobDocRef = doc(db, 'jobs', interviewId);
        const jobDoc = await getDoc(jobDocRef);
        const jobData = jobDoc.exists() ? jobDoc.data() : {};
        const combinedData = { ...interviewData, isMock: jobData.isMock || false };

        setInterview(combinedData as Interview);
        setInterviewState(prev => ({ ...prev, jobTitle: combinedData.title, jobDescription: combinedData.description, isMock: combinedData.isMock }));
        setStep('collect-info');

      } catch (err: any) { 
        setErrorMsg(err.message); 
        setStep('collect-info'); // Fallback to show error
      }
    };
    validateAndInit();
  }, [interviewId, searchParams]);

  // 2. Handle Candidate Info Submission
  const handleInfoSubmit = async (submittedInfo: CandidateInfo, submittedFile: File | null, existingResumeUrl?: string, cloudinaryUrl?: string) => {
    setCandidateInfo(submittedInfo);

    setStep('setup');
    setLoadingMsg("Processing your information...");

    try {
      let base64String = '';
      let resumeMimeType = '';
      let resumeUrlToSave = cloudinaryUrl || existingResumeUrl || '';
      let resumeTextContent = ''; // This will hold the parsed text content of the resume

      if (cloudinaryUrl) {
        setLoadingMsg("Fetching uploaded resume for AI...");
        try {
          const res = await fetch(cloudinaryUrl);
          const blob = await res.blob();
          const [blobBase64, parsedResumeText] = await Promise.all([
            getBlobAsBase64(blob),
            extractResumeText(blob)
          ]);

          base64String = blobBase64;
          resumeMimeType = blob.type || 'application/pdf';
          resumeTextContent = parsedResumeText;
        } catch (error) {
          console.error("Error fetching Cloudinary PDF:", error);
          throw new Error("Failed to process the uploaded resume.");
        }
      } else if (submittedFile) {
        setLoadingMsg("Uploading and parsing your resume...");
        const uploadPromise = uploadToCloudinary(submittedFile, 'auto').catch((error) => {
          console.error("Resume cloudinary upload failed:", error);
          return null;
        });

        const [{ base64, url }, parsedResumeText, cloudinaryResumeUrl] = await Promise.all([
          getFileAsBase64(submittedFile),
          extractResumeText(submittedFile),
          uploadPromise
        ]);

        base64String = base64;
        resumeMimeType = submittedFile.type;
        resumeTextContent = parsedResumeText;
        resumeUrlToSave = cloudinaryResumeUrl || url;
      } else if (userProfile) {
        setLoadingMsg("Synthesizing your profile data for AI...");
        const profileText = `[Candidate Profile Data]\nName: ${submittedInfo.name}\nEmail: ${submittedInfo.email}\nExperience: ${userProfile.experience || 0} Years\nSkills: ${(userProfile.skills || []).join(', ')}`;
        base64String = btoa(unescape(encodeURIComponent(profileText)));
        resumeMimeType = 'text/plain';
        resumeTextContent = profileText; // Use the generated text for AI context
        resumeUrlToSave = 'data:text/plain;base64,' + base64String;
      } else {
        throw new Error("No resume or profile data provided.");
      }

      setLoadingMsg("AI is generating tailored questions... (approx 30s)");
      const aiQuestions = await generateInterviewQuestions(
        interview!.title,
        interview!.description,
        (submittedInfo.experienceType === 'experienced' && submittedInfo.totalExperienceYears)
          ? `${submittedInfo.totalExperienceYears} years ${submittedInfo.totalExperienceMonths} months`
          : "0 years",
        base64String,
        resumeMimeType,
        submittedInfo.language,
        (interview as any).numQuestions || 5,
        resumeTextContent // Pass the parsed text to the AI
      );

      const manualQuestions = (interview as any).manualQuestions || [];
      const questions = [...manualQuestions, ...aiQuestions];

      setInterviewState((prev) => ({
        ...prev,
        questions,
        candidateResumeURL: resumeUrlToSave,
        candidateResumeMimeType: resumeMimeType,
        candidateResumeBase64: base64String,
        candidateResumeText: resumeTextContent, // Store parsed text in state
        language: submittedInfo.language,
        answers: Array(questions.length).fill(null),
        videoURLs: Array(questions.length).fill(null),
        transcriptIds: Array(questions.length).fill(null),
        transcriptTexts: Array(questions.length).fill(null),
        pendingResponseCount: 0,
      }));
      setStep('instructions');
    } catch (err: any) {
        let displayError = "Failed to process resume. Please try again later.";
        try {
            // The error from the backend seems to be a JSON string in the message
            const errorObj = JSON.parse(err.message);
            if (errorObj.error && errorObj.error.message) {
                displayError = errorObj.error.message;
            }
        } catch (e) {
            // If parsing fails, use the original message if it's not too long/complex
            if (err.message && typeof err.message === 'string' && err.message.length < 100) {
                displayError = err.message;
            }
        }
        setErrorMsg(displayError);
        setStep('collect-info');
    }
  };
  
  const checkSpeed = () => {
    setSpeedStatus("Checking...");
    const start = Date.now();
    const img = new Image();
    img.onload = () => {
      const duration = (Date.now() - start) / 1000;
      const speed = (50 * 8) / duration;
      setSpeedStatus(speed > 1000 ? "Excellent" : speed > 500 ? "Good" : "Weak");
    };
    img.src = "https://i.ibb.co/3y9DKsB6/Yellow-and-Black-Illustrative-Education-Logo-1.png?t=" + start;
  };

  // --- RENDER ---
  const Container = ({ children }: { children: React.ReactNode }) => (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-gray-50 dark:bg-slate-950 text-gray-800 dark:text-gray-100 flex flex-col items-center justify-start py-12 px-4 transition-colors duration-500">
      {children}
    </div>
  );

  if (!interview) {
    return (
      <Container>
        {errorMsg ? 
          <div className="text-red-500 bg-red-100 dark:bg-red-900/20 p-4 rounded-lg">{errorMsg}</div> : 
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 border-t-4 border-blue-500 rounded-full animate-spin"></div>
            <div className="absolute inset-3 border-t-4 border-purple-500 rounded-full animate-spin reverse"></div>
          </div>
        }
      </Container>
    );
  }

  if (step === 'validating') {
    return (
      <Container>
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 border-t-4 border-blue-500 rounded-full animate-spin"></div>
          <div className="absolute inset-3 border-t-4 border-purple-500 rounded-full animate-spin reverse"></div>
        </div>
      </Container>
    );
  }

  if (step === 'collect-info') {
    return (
      <Container>
        {step === 'collect-info' && (
          <CandidateInfoForm 
            jobTitle={interviewState.jobTitle}
            onSubmit={handleInfoSubmit} 
            errorMsg={errorMsg}
            user={user}
            userProfile={userProfile}
          />
        )}
      </Container>
    );
  }

  if (step === 'instructions') {
    return (
      <Container>
        <div className="max-w-3xl w-full p-4 md:p-0">
          <h2 className="text-3xl font-extrabold text-center mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Ready for your AI Interview?
          </h2>
          <p className="text-center text-gray-500 dark:text-gray-400 mb-8">Role: {interview.title}</p>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl flex items-start gap-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-lg text-blue-600 dark:text-blue-300"><i className="fas fa-video text-xl"></i></div>
              <div><h4 className="font-bold">Camera On</h4><p className="text-sm text-gray-600 dark:text-gray-400">Ensure good lighting.</p></div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl flex items-start gap-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="bg-purple-100 dark:bg-purple-800 p-2 rounded-lg text-purple-600 dark:text-purple-300"><i className="fas fa-clock text-xl"></i></div>
              <div><h4 className="font-bold">2 Minutes</h4><p className="text-sm text-gray-600 dark:text-gray-400">Time limit per answer.</p></div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl flex items-start gap-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="bg-green-100 dark:bg-green-800 p-2 rounded-lg text-green-600 dark:text-green-300"><i className="fas fa-brain text-xl"></i></div>
              <div><h4 className="font-bold">AI Generated</h4><p className="text-sm text-gray-600 dark:text-gray-400">Tailored to your resume.</p></div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl flex items-start gap-4 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="bg-red-100 dark:bg-red-800 p-2 rounded-lg text-red-600 dark:text-red-300"><i className="fas fa-eye text-xl"></i></div>
              <div><h4 className="font-bold">Proctored</h4><p className="text-sm text-gray-600 dark:text-gray-400">Tab switching is tracked.</p></div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t dark:border-gray-700">
            <button onClick={checkSpeed} className="text-sm font-medium flex items-center gap-2 text-gray-500 hover:text-blue-600 transition-colors">
              <i className="fas fa-wifi"></i> Check Speed {speedStatus && <span className={`px-2 py-0.5 rounded text-xs ${speedStatus.includes('Excellent') || speedStatus.includes('Good') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{speedStatus}</span>}
            </button>
            <button onClick={() => setStep('interview')} className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:shadow-lg hover:scale-[1.02] transition-all">
              I'm Ready, Let's Go
            </button>
          </div>
        </div>
      </Container>
    );
  }

  if (step === 'setup' || step === 'processing') {
    return (
      <Container>
        <div className="flex flex-col items-center max-w-md text-center">
          <div className="relative w-24 h-24 mb-6">
            <div className="absolute inset-0 border-4 border-gray-200 dark:border-gray-700 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
            <i className="fas fa-robot absolute inset-0 flex items-center justify-center text-3xl text-gray-400 dark:text-gray-500"></i>
          </div>
          <h3 className="text-xl font-bold text-gray-800 dark:text-white animate-pulse">{loadingMsg}</h3>
          <p className="mt-4 text-gray-500 dark:text-gray-400 italic text-sm">"The first computer mouse was made of wood."</p>
        </div>
      </Container>
    );
  }

  if (step === 'interview') {
    return (
      <ActiveInterviewSession
        state={interviewState}
        setState={setInterviewState}
        onFinish={(result?: { terminated?: boolean }) => {
          setInterviewTerminated(Boolean(result?.terminated));
          setStep('finish');
        }}
        onTabSwitch={() => setTabSwitches(prev => prev + 1)}
      />
    );
  }

  if (step === 'finish') {
    return <InterviewSubmission state={interviewState} tabSwitches={tabSwitches} interviewId={interviewId!} candidateInfo={candidateInfo} terminated={interviewTerminated} />;
  }

  return null;
};

// --- Sub-Component: Active Interview (Immersive) ---
const ActiveInterviewSession: React.FC<{
  state: InterviewState;
  setState: React.Dispatch<React.SetStateAction<InterviewState>>;
  onFinish: (result?: { terminated?: boolean }) => void;
  onTabSwitch: () => void;
}> = ({ state, setState, onFinish, onTabSwitch }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const answerDeadlineRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_MS / 1000);
  const [countdown, setCountdown] = useState(5);
  const [processingVideo, setProcessingVideo] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const currentQ = state.questions[state.currentQuestionIndex];

  const [tabWarning, setTabWarning] = useState<string | null>(null);
  const tabWarningTimerRef = useRef<any>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenEscapes, setFullscreenEscapes] = useState(0);
  const [isTerminated, setIsTerminated] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const hasEnteredFullscreenRef = useRef(false);
  const sessionReady = isFullscreen && cameraReady && !isTerminated;

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      setIsStopping(true);
      answerDeadlineRef.current = null;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const syncTimeLeftFromDeadline = () => {
    const deadline = answerDeadlineRef.current;
    if (!deadline) return;

    const remainingSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    setTimeLeft(remainingSeconds);

    if (remainingSeconds === 0 && mediaRecorderRef.current?.state !== 'inactive') {
      stopRecording();
    }
  };

  const processRecordedAnswer = async (blob: Blob, questionIndex: number, language: string) => {
    let videoUrl: string | null = null;
    let transcriptId: string | null = null;
    let transcriptText: string | null = null;

    try {
      videoUrl = await uploadToCloudinary(blob, 'video');
      if (videoUrl) {
        transcriptId = await requestTranscription(videoUrl, language);
      } else {
        transcriptText = '(Video upload failed.)';
      }
    } catch (error) {
      console.error("Upload/transcription error:", error);
      transcriptText = '(Video upload or transcription setup failed.)';
    } finally {
      setState(prev => {
        const nextVideoUrls = [...prev.videoURLs];
        const nextTranscriptIds = [...prev.transcriptIds];
        const nextTranscriptTexts = prev.transcriptTexts
          ? [...prev.transcriptTexts]
          : Array(prev.questions.length).fill(null);

        nextVideoUrls[questionIndex] = videoUrl;
        nextTranscriptIds[questionIndex] = transcriptId;

        if (transcriptText) {
          nextTranscriptTexts[questionIndex] = transcriptText;
        }

        return {
          ...prev,
          videoURLs: nextVideoUrls,
          transcriptIds: nextTranscriptIds,
          transcriptTexts: nextTranscriptTexts,
          pendingResponseCount: Math.max((prev.pendingResponseCount ?? 1) - 1, 0),
        };
      });
    }
  };

  // Anti-cheating & Fullscreen effect
  useEffect(() => {
    // Basic Anti-Copy
    const handleCopyCutPaste = (e: ClipboardEvent) => e.preventDefault();
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (['c', 'v', 'x', 's'].includes(e.key.toLowerCase())) e.preventDefault();
      }
      if (e.key === 'F12') e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C'].includes(e.key)) e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && ['u', 'U'].includes(e.key)) e.preventDefault();
    };
    const blockDrag = (e: DragEvent) => e.preventDefault();

    document.addEventListener('copy', handleCopyCutPaste);
    document.addEventListener('cut', handleCopyCutPaste);
    document.addEventListener('paste', handleCopyCutPaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('dragstart', blockDrag);

    return () => {
      document.removeEventListener('copy', handleCopyCutPaste);
      document.removeEventListener('cut', handleCopyCutPaste);
      document.removeEventListener('paste', handleCopyCutPaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('dragstart', blockDrag);
    };
  }, []);

  useEffect(() => {
    if (isTerminated) return;

    const handleFullscreenChange = () => {
      const isFS = !!getFullscreenElement();
      setIsFullscreen(isFS);
      
      if (isFS) {
        hasEnteredFullscreenRef.current = true;
        setFullscreenError(null);
      } else if (hasEnteredFullscreenRef.current) {
        setFullscreenEscapes(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            setIsTerminated(true);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
              mediaRecorderRef.current.stop();
            }
            onFinish({ terminated: true });
          }
          return newCount;
        });
      }
    };

    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange as EventListener);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange as EventListener);
    };
  }, [isTerminated, onFinish]);


  // Tab Visibility
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        onTabSwitch();
        const warning = 'TAB SWITCH DETECTED - This activity has been recorded and will be flagged in your report.';
        setTabWarning(warning);
        // Auto-clear the warning banner after 5 seconds
        if (tabWarningTimerRef.current) clearTimeout(tabWarningTimerRef.current);
        tabWarningTimerRef.current = setTimeout(() => setTabWarning(null), 5000);
      }

      syncTimeLeftFromDeadline();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (tabWarningTimerRef.current) clearTimeout(tabWarningTimerRef.current);
    };
  }, [onTabSwitch]);

  // Camera
  useEffect(() => {
    let isCancelled = false;

    const setupCamera = async () => {
      setCameraReady(false);
      setCameraError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("This browser does not support camera/microphone recording.");
        return;
      }

      try {
        // Low-spec optimization: 320x240 reduces GPU/RAM pressure significantly.
        // Low video resolution is sufficient for recording and transcription.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 } },
          audio: true
        });

        if (isCancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraReady(true);
      } catch (error) {
        console.error("Camera setup error:", error);
        if (!isCancelled) {
          setCameraError("Camera and microphone access is required to continue.");
        }
      }
    };
    setupCamera();
    return () => {
      isCancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      speak.stop();
    };
  }, []);

  // TTS auto-play - Kokoro TTS (English) / Web Speech API (Hindi, Marathi)
  // Reads the current question aloud as soon as it appears on screen.
  useEffect(() => {
    if (!currentQ || !sessionReady) return;

    // Map the short language code from candidate selection to BCP-47
    const langMap: Record<string, string> = { en: 'en', hi: 'hi-IN', mr: 'mr-IN' };
    const ttsLang = langMap[state.language] || 'en';

    // Small delay so the question text renders before audio starts
    const timeout = setTimeout(() => {
      speak(currentQ, {
        lang: ttsLang,
        onEnd: () => console.log('[TTS] Finished reading question'),
        onError: (err) => console.warn('[TTS] Error reading question:', err),
      });
    }, 400);

    return () => {
      clearTimeout(timeout);
      speak.stop();
    };
  }, [currentQ, state.language, sessionReady]);



  // Auto-Logic
  useEffect(() => {
    if (!sessionReady || isRecording || processingVideo || isStopping) {
      return;
    }

    if (countdown > 0) {
      const t = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(t);
    } else if (countdown === 0) {
      startRecording();
    }
  }, [countdown, sessionReady, isRecording, processingVideo, isStopping]);

  useEffect(() => {
    if (!isRecording || isTerminated) return;

    syncTimeLeftFromDeadline();
    const timer = window.setInterval(syncTimeLeftFromDeadline, 1000);
    document.addEventListener('visibilitychange', syncTimeLeftFromDeadline);
    window.addEventListener('focus', syncTimeLeftFromDeadline);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', syncTimeLeftFromDeadline);
      window.removeEventListener('focus', syncTimeLeftFromDeadline);
    };
  }, [isRecording, isTerminated]);

  const startRecording = () => {
    if (!sessionReady || !streamRef.current) return;
    if (typeof MediaRecorder === 'undefined') {
      setCameraError("This browser does not support in-browser recording.");
      return;
    }
    
    // Low-spec: 150kbps keeps upload and encode costs low on weaker devices.
    let options: any = { videoBitsPerSecond: 150_000 };
    if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        options.mimeType = 'video/webm;codecs=vp8,opus';
    } else if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('video/mp4')) {
        options.mimeType = 'video/mp4';
    }

    const questionIndex = state.currentQuestionIndex;
    const isLastQuestion = questionIndex >= state.questions.length - 1;
    let recorder: MediaRecorder;

    try {
      recorder = new MediaRecorder(streamRef.current, options);
    } catch (error) {
      console.error("MediaRecorder setup error:", error);
      setCameraError("Recording could not be started on this browser/device.");
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onerror = (error) => {
      console.error("Recorder error:", error);
      answerDeadlineRef.current = null;
      setIsRecording(false);
      setIsStopping(false);
      setProcessingVideo(false);
      setCameraError("Recording failed. Please refresh and try again.");
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      chunksRef.current = [];
      answerDeadlineRef.current = null;

      setState(prev => {
        const nextAnswers = [...prev.answers];
        const nextTranscriptTexts = prev.transcriptTexts
          ? [...prev.transcriptTexts]
          : Array(prev.questions.length).fill(null);

        nextAnswers[questionIndex] = "Answered";
        nextTranscriptTexts[questionIndex] = null;

        return {
          ...prev,
          answers: nextAnswers,
          transcriptTexts: nextTranscriptTexts,
          currentQuestionIndex: isLastQuestion ? questionIndex : questionIndex + 1,
          pendingResponseCount: (prev.pendingResponseCount ?? 0) + 1,
        };
      });

      void processRecordedAnswer(blob, questionIndex, state.language);
      setProcessingVideo(false);
      setIsStopping(false);
      if (isLastQuestion) {
        onFinish();
      } else {
        setCountdown(5);
        setTimeLeft(QUESTION_TIME_MS / 1000);
      }
    };
    mediaRecorderRef.current = recorder;
    try {
      recorder.start();
      answerDeadlineRef.current = Date.now() + QUESTION_TIME_MS;
      setTimeLeft(QUESTION_TIME_MS / 1000);
      setIsRecording(true);
      setCameraError(null);
    } catch (error) {
      console.error("Recorder start error:", error);
      setCameraError("Recording could not be started on this browser/device.");
    }
  };

  const renderFullscreenOverlay = () => {
    if (!isFullscreen && !isTerminated) {
      return createPortal(
        <div className="fixed inset-0 z-[10000] bg-black/95 flex items-center justify-center p-4 sm:p-6 text-white text-center">
          <div className="max-w-md w-full p-6 sm:p-8 bg-[#111] rounded-2xl border border-red-500/30 shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-yellow-500"></div>
            <i className="fas fa-exclamation-triangle text-5xl text-yellow-500 mb-4 animate-pulse"></i>
            <h2 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Fullscreen Required</h2>
            <p className="text-gray-300 mb-6 font-medium text-xs sm:text-sm leading-relaxed">
              {cameraError || fullscreenError || (
                hasEnteredFullscreenRef.current
                  ? `You have exited fullscreen mode. You have ${3 - fullscreenEscapes} escape(s) remaining before automatic termination.`
                  : "This assessment must be taken in fullscreen mode to ensure a secure environment. Please enter fullscreen to start."
              )}
            </p>
            <button 
              onClick={async () => {
                setFullscreenError(null);
                try {
                  const docEl = document.documentElement as HTMLElement & {
                    webkitRequestFullscreen?: () => Promise<void>;
                    msRequestFullscreen?: () => Promise<void>;
                  };

                  if (docEl.requestFullscreen) {
                    await docEl.requestFullscreen();
                  } else if (docEl.webkitRequestFullscreen) {
                    await docEl.webkitRequestFullscreen();
                  } else if (docEl.msRequestFullscreen) {
                    await docEl.msRequestFullscreen();
                  } else {
                    setFullscreenError("Fullscreen mode is not supported on this browser/device.");
                  }
                } catch (err) {
                  console.error("Fullscreen error:", err);
                  setFullscreenError("Fullscreen could not be enabled. Please allow fullscreen and try again.");
                }
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg hover:shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2"
            >
              <i className="fas fa-terminal text-lg"></i>
              {hasEnteredFullscreenRef.current ? "Return to Fullscreen" : "Enter Fullscreen & Start"}
            </button>
          </div>
        </div>,
        document.body
      );
    }
    return null;
  };

  // --- SPLIT-PANEL DASHBOARD LAYOUT ---
  return (
    <div
      className="fixed inset-0 z-[9999] bg-gray-100 dark:bg-slate-950 text-gray-900 dark:text-white flex flex-col overflow-hidden select-none"
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      {renderFullscreenOverlay()}

      {cameraError && (
        <div className="px-2 md:px-3 pt-2 md:pt-3">
          <div className="w-full px-3 md:px-5 py-2.5 md:py-3 bg-red-50 dark:bg-red-900/30 rounded-lg md:rounded-xl border border-red-200 dark:border-red-700/50 shadow-sm text-red-700 dark:text-red-300 text-xs md:text-sm font-medium">
            {cameraError}
          </div>
        </div>
      )}

      {/* Main content: camera (left) + question (right) */}
      <div className="flex-1 flex flex-col md:flex-row gap-2 md:gap-3 p-2 md:p-3 overflow-hidden min-h-0">

        {/* Left panel: camera feed */}
        <div className="w-full md:w-5/12 flex flex-col gap-1.5 md:gap-3 shrink-0 md:shrink md:min-h-0">
          {/* Camera Card */}
          <div className="relative min-h-[140px] h-[30vh] md:h-auto md:flex-1 md:min-h-[240px] bg-gray-900 rounded-xl md:rounded-2xl overflow-hidden border border-gray-700/50 shadow-xl">
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />

            {/* Countdown Overlay (scoped to camera) */}
            {sessionReady && countdown > 0 && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-xl md:rounded-2xl">
                <p className="text-white/80 text-sm md:text-lg font-light mb-1 md:mb-2 tracking-widest uppercase">Get Ready</p>
                <span className="text-5xl md:text-8xl font-black text-white" style={{ animationDuration: '1s', animation: 'pulse 1s ease-in-out infinite' }}>{countdown}</span>
              </div>
            )}

            {/* TicTacToe during processing (scoped to camera) */}
            {processingVideo && <TicTacToe />}

            {/* Gradient bottom edge */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-900/80 to-transparent pointer-events-none"></div>
          </div>

          {/* Status Bar Below Camera */}
          <div className="flex items-center justify-between px-2 md:px-4 py-1.5 md:py-2.5 bg-white dark:bg-gray-800/60 rounded-lg md:rounded-xl border border-gray-200 dark:border-gray-700/50 shadow-sm">
            <div className="flex items-center gap-2 md:gap-3">
              {/* REC Indicator */}
              {isRecording ? (
                <div className="flex items-center gap-1 md:gap-1.5 bg-red-500/15 text-red-600 dark:text-red-400 px-2 md:px-2.5 py-0.5 md:py-1 rounded-md md:rounded-lg text-[10px] md:text-[11px] font-bold uppercase tracking-wider animate-pulse">
                  <div className="w-1.5 md:w-2 h-1.5 md:h-2 bg-red-500 rounded-full"></div>
                  REC
                </div>
              ) : !cameraReady ? (
                <div className="flex items-center gap-1 md:gap-1.5 bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 px-2 md:px-2.5 py-0.5 md:py-1 rounded-md md:rounded-lg text-[10px] md:text-[11px] font-bold uppercase tracking-wider">
                  <div className="w-1.5 md:w-2 h-1.5 md:h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                  INITIALIZING
                </div>
              ) : (
                <div className="flex items-center gap-1 md:gap-1.5 bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 px-2 md:px-2.5 py-0.5 md:py-1 rounded-md md:rounded-lg text-[10px] md:text-[11px] font-medium">
                  <div className="w-1.5 md:w-2 h-1.5 md:h-2 bg-gray-400 rounded-full"></div>
                  STANDBY
                </div>
              )}
            </div>
            <div className={`px-2 md:px-2.5 py-0.5 md:py-1 rounded-md md:rounded-lg text-[10px] md:text-[11px] font-mono font-semibold border ${isFullscreen ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20'}`}>
              {isFullscreen ? 'FULLSCREEN ON' : 'FULLSCREEN OFF'}
            </div>
          </div>
        </div>

        {/* Right panel: question + controls */}
        <div className="w-full md:w-7/12 flex flex-col gap-2 md:gap-3 min-h-0 flex-1">
          {/* Question Card */}
          <div className="flex-1 flex flex-col bg-white dark:bg-gray-800/60 rounded-xl md:rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-xl overflow-hidden min-h-0">

            {/* Question Header: Counter + Timer */}
            <div className="flex items-center justify-between px-3 md:px-6 py-2.5 md:py-4 border-b border-gray-100 dark:border-gray-700/50 shrink-0">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-6 h-6 md:w-8 md:h-8 rounded-md md:rounded-lg bg-blue-500/10 dark:bg-blue-500/15 flex items-center justify-center">
                  <i className="fas fa-list-ol text-blue-500 text-xs md:text-sm"></i>
                </div>
                <div>
                  <p className="text-[9px] md:text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-widest font-medium">Question</p>
                  <p className="text-sm md:text-lg font-bold text-gray-800 dark:text-white">
                    {state.currentQuestionIndex + 1} <span className="text-gray-400 dark:text-gray-500 text-xs md:text-sm font-normal">/ {state.questions.length}</span>
                  </p>
                </div>
              </div>
              {/* Timer */}
              <div className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl font-mono font-bold text-xs md:text-sm transition-colors ${timeLeft < 30
                ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-700/50 dark:text-white dark:border-gray-600'
                } border shadow-sm`}>
                <div className={`w-1.5 md:w-2 h-1.5 md:h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400 dark:bg-gray-500'}`}></div>
                <i className="fas fa-clock text-[10px] md:text-xs opacity-60"></i>
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </div>
            </div>

            {/* Question Body */}
            <div className="flex-1 overflow-y-auto px-3 md:px-6 py-3 md:py-6 flex items-start">
              <div className="w-full">
                <p className="text-[10px] md:text-xs text-blue-500 dark:text-blue-400 font-semibold uppercase tracking-widest mb-2 md:mb-3">
                  <i className="fas fa-microphone-alt mr-1"></i> Answer this question
                </p>
                <h2 className="text-base md:text-2xl font-semibold leading-relaxed text-gray-800 dark:text-gray-100">
                  {currentQ}
                </h2>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 md:gap-3 px-3 md:px-6 py-2.5 md:py-4 border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30 shrink-0">

              {/* Next / Stop Button */}
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-2.5 rounded-lg md:rounded-xl font-bold text-xs md:text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20 transform transition hover:scale-[1.02] active:scale-95"
                >
                  Next
                  <i className="fas fa-arrow-right"></i>
                </button>
              ) : processingVideo || isStopping ? (
                <div className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-2.5 rounded-lg md:rounded-xl text-xs md:text-sm font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 animate-pulse">
                  <i className="fas fa-circle-notch fa-spin"></i>
                  Processing...
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-2.5 rounded-lg md:rounded-xl text-xs md:text-sm font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-600">
                  <i className="fas fa-hourglass-half"></i>
                  Waiting...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-2 md:px-3 pb-2 md:pb-3">
        {/* Tab-switch warning banner (red, real-time) */}
        {tabWarning && (
          <div className="w-full px-3 md:px-5 py-2 md:py-3 bg-red-50 dark:bg-red-900/30 rounded-lg md:rounded-xl border border-red-200 dark:border-red-700/50 shadow-sm flex items-center gap-2 md:gap-3 animate-pulse">
            <div className="w-5 md:w-7 h-5 md:h-7 rounded-md md:rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
              <i className="fas fa-exclamation-triangle text-red-500 text-[10px] md:text-xs"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] md:text-[10px] text-red-600 dark:text-red-400 uppercase tracking-widest font-bold mb-0.5">Security Alert</p>
              <p className="text-xs md:text-sm text-red-700 dark:text-red-300 font-semibold truncate">{tabWarning}</p>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-mono font-bold shrink-0">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></div>
              FLAGGED
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Submission Screen ---
const InterviewSubmission: React.FC<{
  state: InterviewState;
  tabSwitches: number;
  interviewId: string;
  candidateInfo: CandidateInfo;
  terminated: boolean;
}> = ({ state, tabSwitches, interviewId, candidateInfo, terminated }) => {
  const { user } = useAuth();
  const [status, setStatus] = useState("Finalizing transcripts...");
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);
  const [reportUrl, setReportUrl] = useState('');
  const navigate = useNavigate();
  const [factIndex, setFactIndex] = useState(0);
  const hasSubmittedRef = useRef(false);
  const latestStateRef = useRef(state);
  const facts = [
    "The first computer bug was a real moth.", "Symbolics.com was the first domain.", "NASA's internet is 91 GB/s.",
    "The Firefox logo is a red panda.", "Email existed before the Web."
  ];

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    const i = setInterval(() => setFactIndex(p => (p + 1) % facts.length), 4000);
    return () => clearInterval(i);
  }, [facts.length]);

  useEffect(() => {
    // Guard: only run once - object deps (state, candidateInfo, terminated) cause
    // React to re-fire this effect on every render, creating duplicate reports.
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    const finalize = async () => {
      const waitForPendingResponses = async () => {
        let attempts = 0;

        while ((latestStateRef.current.pendingResponseCount ?? 0) > 0 && attempts < 180) {
          const pendingResponses = latestStateRef.current.pendingResponseCount ?? 0;
          setStatus(`Processing ${pendingResponses} recorded answer${pendingResponses === 1 ? '' : 's'}...`);
          await sleep(1000);
          attempts++;
        }
      };

      const resolveTranscriptText = async (transcriptId: string | null, existingText: string | null) => {
        if (!transcriptId) {
          return existingText || '(Transcript unavailable)';
        }

        if (existingText) {
          return existingText;
        }

        for (let attempts = 0; attempts < TRANSCRIPT_POLL_ATTEMPTS; attempts++) {
          await sleep(TRANSCRIPT_POLL_DELAY_MS);
          const res = await fetchTranscriptText(transcriptId);

          if (res.status === 'completed' || res.status === 'error') {
            return res.text || '(No speech detected)';
          }
        }

        return '(Transcription timeout)';
      };

      try {
        await waitForPendingResponses();
        setStatus("Finalizing transcripts...");
        const finalState = latestStateRef.current;
        const transcriptTexts = await Promise.all(
          finalState.questions.map((_, index) =>
            resolveTranscriptText(
              finalState.transcriptIds[index] ?? null,
              finalState.transcriptTexts?.[index] ?? null
            )
          )
        );
        
        setStatus("AI Analyzing performance...");
        let base64Resume = finalState.candidateResumeBase64;
        let resumeTextContent = finalState.candidateResumeText;
        
        if (!base64Resume) {
          // Fallback to fetch resume if not already base64'd (e.g. from Cloudinary URL)
          if (!finalState.candidateResumeURL) {
              throw new Error("Candidate resume URL is missing for feedback generation.");
          }

          const resp = await fetch(finalState.candidateResumeURL);
          const blob = await resp.blob();

          if (!resumeTextContent) {
            resumeTextContent = await extractResumeText(blob);
          }

          base64Resume = await getBlobAsBase64(blob);
        }

        const candidateExperience = (candidateInfo.experienceType === 'experienced' && candidateInfo.totalExperienceYears)
            ? `${candidateInfo.totalExperienceYears} years ${candidateInfo.totalExperienceMonths} months`
            : "0 years";

        const feedbackRaw = await generateFeedback(
          finalState.jobTitle,
          finalState.jobDescription,
          candidateExperience,
          base64Resume,
          finalState.candidateResumeMimeType!,
          finalState.questions,
          transcriptTexts,
          resumeTextContent
        );

        // The AI prompt for generateFeedback should be structured to consistently return scores
        // in the format: "Overall Score: X/100", "Resume Score: Y/100", "Q&A Score: Z/100".
        // We now calculate the overall score on the client side.
        const parseScoreValue = (regex: RegExp): number => {
          const match = feedbackRaw.match(regex);
          if (match && match[1]) {
            return parseInt(match[1], 10);
          }
          return 0;
        };

        const resumeScoreNum = parseScoreValue(/Resume Score:\s*(\d{1,3})(?:\s*\/\s*100)?/i);
        const qnaScoreNum = parseScoreValue(/Q&A Score:\s*(\d{1,3})(?:\s*\/\s*100)?/i);

        // Calculate Overall Score based on the defined mathematical model
        const overallScoreNum = Math.round((resumeScoreNum * 0.4) + (qnaScoreNum * 0.6));

        setStatus("Saving Report...");
        const attemptData = {
            ...finalState,
            candidateResumeBase64: null, // Do not bloat Firebase storage
            transcriptTexts,
            pendingResponseCount: 0,
            feedback: feedbackRaw,
            score: `${overallScoreNum}/100`,
            resumeScore: `${resumeScoreNum}/100`,
            qnaScore: `${qnaScoreNum}/100`,
            candidateInfo,
            status: terminated ? 'Terminated' : 'Completed',
            submittedAt: serverTimestamp(), 
            candidateUID: user?.uid || null,
            interviewId: interviewId,
            jobId: interviewId,
            isMock: state.isMock || false,
            meta: { tabSwitchCount: tabSwitches }
        }
        const docRef = await addDoc(collection(db, 'interviews', interviewId, 'attempts'), attemptData);
        setReportUrl(`/report/${interviewId}/${docRef.id}`);
        setShowCompletionPopup(true);
        setStatus('Successfully Submitted!');
      } catch (err) { 
          console.error("Finalization error:", err);
          setStatus("An error occurred while saving your report. Please contact support."); 
      }
    };
    finalize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
      <>
      <div className="min-h-screen bg-gray-50 dark:bg-transparent flex flex-col items-center justify-center p-4">
        <div className="relative w-24 h-24 mb-8">
          <div className="absolute inset-0 border-4 border-green-100 dark:border-gray-800 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-t-green-500 border-r-green-400 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
          <i className="fas fa-check absolute inset-0 flex items-center justify-center text-3xl text-green-500"></i>
        </div>
        <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
          {terminated ? 'Interview Terminated' : 'Interview Complete'}
        </h2>
        <p className={`mb-12 animate-pulse ${terminated ? 'text-red-500 font-bold' : 'text-gray-500 dark:text-gray-400'}`}>
          {terminated ? 'Session revoked due to security violations.' : status}
        </p>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl max-w-lg text-center border border-gray-100 dark:border-gray-700 shadow-xl">
          <p className="text-xs font-bold text-blue-500 uppercase mb-3 tracking-widest">Tech Fact</p>
          <p className="text-gray-700 dark:text-gray-300 italic text-lg transition-all duration-500">"{facts[factIndex]}"</p>
        </div>
      </div>

      {showCompletionPopup && createPortal(
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4" onClick={() => navigate('/')}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg text-center p-8 m-4 animate-fade-in-up" onClick={e => e.stopPropagation()}>
            <div className="w-20 h-20 mx-auto bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mb-4 border-4 border-green-200 dark:border-green-800">
                <i className="fas fa-award text-4xl text-green-500"></i>
            </div>
            <h3 className="font-bold text-2xl text-gray-900 dark:text-white mb-2">Thank You!</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">Your interview has been successfully submitted. The recruiter will be in touch with the next steps.</p>
            
            <div className="bg-blue-50 dark:bg-blue-900/30 p-6 rounded-xl border border-blue-100 dark:border-blue-800">
              <h4 className="font-semibold text-lg text-blue-800 dark:text-blue-300 mb-2">What happens next?</h4>
              <p className="text-sm text-blue-700 dark:text-blue-400 mb-4">Your response has been saved successfully. The recruiter can now review your submission and follow up with the next steps.</p>
              <div className="flex flex-col gap-3">
                <button onClick={() => navigate('/submit-review')} className="w-full bg-gradient-to-r from-pink-500 to-orange-400 text-white font-bold py-3 px-5 rounded-lg hover:from-pink-600 hover:to-orange-500 transition-colors shadow-lg shadow-pink-500/20 transform hover:-translate-y-0.5 flex justify-center items-center gap-2">
                  <i className="fa-solid fa-star text-yellow-300 drop-shadow-md"></i> Give Review
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <a href={`#${reportUrl}`} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                View Submission Report
              </a>
              <button onClick={() => navigate('/')} className="flex-1 text-center px-5 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Go to Homepage
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default CandidateInterviewFlow;
