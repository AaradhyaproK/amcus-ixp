import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../services/firebase';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { AlertTriangle, Clock, Code, Terminal, Play, FileCode, Settings, CheckCircle, Calculator as CalculatorIcon, Flag, X } from 'lucide-react';
import { sendInterviewInvitations } from '../services/brevoService';

const TestInfoForm: React.FC<{ onSubmit: (info: {name: string, email: string}) => void }> = ({ onSubmit }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-[#050505] p-6">
      <div className="max-w-md w-full bg-white dark:bg-[#111] p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-white/10">
        <h2 className="text-2xl font-bold text-center mb-2 dark:text-white">Candidate Information</h2>
        <p className="text-center text-gray-500 dark:text-gray-400 mb-6">Please provide your details to begin the assessment.</p>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({name, email}); }} className="space-y-4">
          <input type="text" placeholder="Full Name" required value={name} onChange={e => setName(e.target.value)} className="w-full p-3 border rounded-xl dark:bg-[#1a1a1a] dark:text-white dark:border-white/10 outline-none focus:border-blue-500" />
          <input type="email" placeholder="Email Address" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 border rounded-xl dark:bg-[#1a1a1a] dark:text-white dark:border-white/10 outline-none focus:border-blue-500" />
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3.5 rounded-xl font-bold shadow-lg transition-all">Start Assessment</button>
        </form>
      </div>
    </div>
  );
};

const Calculator: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [display, setDisplay] = useState('0');
  const [history, setHistory] = useState('');
  const [firstOperand, setFirstOperand] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForSecondOperand, setWaitingForSecondOperand] = useState(false);

  const handleDigit = (digit: string) => {
    if (history.includes('=')) {
      handleClear();
      setDisplay(digit);
      return;
    }
    if (waitingForSecondOperand) {
      setDisplay(digit);
      setWaitingForSecondOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display.length < 12 ? display + digit : display);
    }
  };

  const handleDecimal = () => {
    if (history.includes('=')) {
      handleClear();
      setDisplay('0.');
      return;
    }
    if (waitingForSecondOperand) {
      setDisplay('0.');
      setWaitingForSecondOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleOperator = (nextOperator: string) => {
    const inputValue = parseFloat(display);
    if (operator && !waitingForSecondOperand) {
      const result = calculate(firstOperand!, inputValue, operator);
      setDisplay(String(result));
      if (typeof result === 'number') {
        setFirstOperand(result);
      } else {
        setFirstOperand(null);
      }
      setHistory(`${result} ${nextOperator}`);
    } else {
      setFirstOperand(inputValue);
      setHistory(`${inputValue} ${nextOperator}`);
    }
    setWaitingForSecondOperand(true);
    setOperator(nextOperator);
  };

  const calculate = (first: number, second: number, op: string) => {
    switch (op) {
      case '+':
        return first + second;
      case '-':
        return first - second;
      case '*':
        return first * second;
      case '/':
        return second === 0 ? 'Error' : first / second;
      default:
        return second;
    }
  };

  const handleEquals = () => {
    if (operator && firstOperand !== null) {
      const inputValue = parseFloat(display);
      if (waitingForSecondOperand) return;
      const result = calculate(firstOperand, inputValue, operator);
      setHistory(`${firstOperand} ${operator} ${inputValue} =`);
      setDisplay(String(result));
      setFirstOperand(null);
      setOperator(null);
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setHistory('');
    setFirstOperand(null);
    setOperator(null);
    setWaitingForSecondOperand(false);
  };

  const handleBackspace = () => {
    if (history.includes('=')) return;
    if (waitingForSecondOperand) return;
    setDisplay(d => d.length > 1 ? d.slice(0, -1) : '0');
  };

  const handleToggleSign = () => {
    if (display !== '0') {
      setDisplay(String(parseFloat(display) * -1));
    }
  };

  const handleButtonClick = (btnValue: string) => {
    if (['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'].includes(btnValue)) {
      handleDigit(btnValue);
    } else if (btnValue === '.') {
      handleDecimal();
    } else if (['/', '*', '-', '+'].includes(btnValue)) {
      handleOperator(btnValue);
    } else if (btnValue === '=') {
      handleEquals();
    } else if (btnValue === 'AC') {
      handleClear();
    } else if (btnValue === 'backspace') {
      handleBackspace();
    } else if (btnValue === '+/-') {
      handleToggleSign();
    }
  };

  const getButtonClass = (type: 'operator' | 'number' | 'special') => {
    switch (type) {
      case 'operator':
        return 'bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white';
      case 'special':
        return 'bg-gray-300 dark:bg-gray-400 hover:bg-gray-400 dark:hover:bg-gray-500 active:bg-gray-500 text-black';
      case 'number':
      default:
        return 'bg-gray-600 dark:bg-gray-700 hover:bg-gray-500 dark:hover:bg-gray-600 active:bg-gray-600 text-white';
    }
  };

  const buttonGrid = [
    { label: 'AC', type: 'special', value: 'AC' },
    { label: '+/-', type: 'special', value: '+/-' },
    { label: '⌫', type: 'special', value: 'backspace' },
    { label: '÷', type: 'operator', value: '/' },
    { label: '7', type: 'number', value: '7' },
    { label: '8', type: 'number', value: '8' },
    { label: '9', type: 'number', value: '9' },
    { label: '×', type: 'operator', value: '*' },
    { label: '4', type: 'number', value: '4' },
    { label: '5', type: 'number', value: '5' },
    { label: '6', type: 'number', value: '6' },
    { label: '−', type: 'operator', value: '-' },
    { label: '1', type: 'number', value: '1' },
    { label: '2', type: 'number', value: '2' },
    { label: '3', type: 'number', value: '3' },
    { label: '+', type: 'operator', value: '+' },
    { label: '0', type: 'number', value: '0', className: 'col-span-2' },
    { label: '.', type: 'number', value: '.' },
    { label: '=', type: 'operator', value: '=' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="bg-black rounded-2xl shadow-2xl border border-gray-800 w-80 select-none animate-in fade-in-90 slide-in-from-bottom-10 duration-300"
      >
        <div className="p-3 flex items-center justify-between">
          <span className="text-xs text-gray-400 font-bold">Calculator</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-gray-300">
              <X size={16} />
          </button>
        </div>
        <div className="p-6 pt-0">
          <div className="text-right font-sans mb-4 h-24 flex flex-col justify-end">
            <div className="text-gray-400 text-xl h-8 truncate">{history}</div>
            <div className="text-white text-6xl font-light break-all leading-tight">{display}</div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {buttonGrid.map(btn => (
              <button
                key={btn.label}
                onClick={() => handleButtonClick(btn.value)}
                className={`h-16 rounded-full text-2xl font-medium transition-colors transform active:scale-95 disabled:opacity-50 ${getButtonClass(btn.type as any)} ${btn.className || ''} ${btn.label === '0' ? 'text-left pl-6' : ''}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const TakeTest: React.FC = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user, userProfile } = useAuth();
  const [test, setTest] = useState<any>(null);
  const [answers, setAnswers] = useState<any>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [codeLang, setCodeLang] = useState('javascript');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [resultData, setResultData] = useState<any>(null);
  const [showPromoPopup, setShowPromoPopup] = useState(false);
  const [markedQuestions, setMarkedQuestions] = useState<Record<number, boolean>>({});
  const [showCalculator, setShowCalculator] = useState(false);
  const [activeCodeTab, setActiveCodeTab] = useState<'problem' | 'code'>('problem');
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenEscapes, setFullscreenEscapes] = useState(0);
  const [isTerminated, setIsTerminated] = useState(false);
  const hasEnteredFullscreenRef = useRef(false);
  
  const [step, setStep] = useState<'collect-info' | 'test' | 'finish'>(user ? 'test' : 'collect-info');
  const [candidateInfo, setCandidateInfo] = useState({
    name: userProfile?.name || user?.displayName || '',
    email: user?.email || ''
  });

  const handleSubmitRef = useRef<(reason?: string) => void>(() => { });

  useEffect(() => {
    // If user is logged in, skip the info collection step.
    // This handles cases where user/profile data loads after initial render.
    if (user && step === 'collect-info') {
      setCandidateInfo({
        name: userProfile?.name || user.displayName || '',
        email: user.email || ''
      });
      setStep('test');
    }
  }, [user, userProfile, step]);

  useEffect(() => {
    const fetchTest = async () => {
      if (!testId) return;
      const snap = await getDoc(doc(db, 'tests', testId));
      if (snap.exists()) {
        const testData = { id: snap.id, ...snap.data() } as any;
        setTest(testData);
        if (testData.duration && !isNaN(Number(testData.duration))) {
          setTimeLeft(testData.duration * 60);
        }
      }
    };
    fetchTest();
  }, [testId]);

  // Fullscreen effect
  useEffect(() => {
    if (step !== 'test' || isTerminated) return;

    const handleFullscreenChange = () => {
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
      
      if (isFS) {
        hasEnteredFullscreenRef.current = true;
      } else if (hasEnteredFullscreenRef.current) {
        setFullscreenEscapes(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            setIsTerminated(true);
            handleSubmitRef.current?.('terminated');
          }
          return newCount;
        });
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [step, isTerminated]);

  // Timer effect
  useEffect(() => {
    if (step !== 'test' || timeLeft === null || timeLeft <= 0 || submitting || !isFullscreen || isTerminated) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timer);
  }, [step, timeLeft, submitting, isFullscreen, isTerminated]);

  // Tab switch detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitchCount(prev => prev + 1);
        setShowWarning(true);
        setTimeout(() => setShowWarning(false), 3000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Anti-cheating: Disable Copy, Cut, Paste, Context Menu, and Keyboard Shortcuts
  useEffect(() => {
    if (step !== 'test') return;

    const handleCopyCutPaste = (e: ClipboardEvent) => {
      e.preventDefault();
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+S
      if (e.ctrlKey || e.metaKey) {
        if (['c', 'v', 'x', 's'].includes(e.key.toLowerCase())) {
          e.preventDefault();
        }
      }
      // Prevent F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
      if (e.key === 'F12') {
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C'].includes(e.key)) {
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && ['u', 'U'].includes(e.key)) {
        e.preventDefault();
      }
    };

    const blockDrag = (e: DragEvent) => {
      e.preventDefault();
    };

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
  }, [step]);

  const handleAnswer = (val: any) => {
    setAnswers({ ...answers, [currentQ]: val });
  };

  const handleMarkForReview = () => {
    setMarkedQuestions(prev => ({
      ...prev,
      [currentQ]: !prev[currentQ]
    }));
  };


  const handleSubmit = async (reason?: string) => {
    if (!test || !test.questions) return;
    setSubmitting(true);

    let score = 0;
    let feedback = '';

    if (reason === 'terminated') {
      score = 0;
      feedback = 'Test terminated automatically due to security violations (left fullscreen too many times).';
    } else if (test.type === 'aptitude') {
      let correctCount = 0;
      test.questions.forEach((q: any, i: number) => {
        if (answers[i] === q.correctIndex) correctCount++;
      });
      score = Math.round((correctCount / test.questions.length) * 100);
    } else {
      // AI Grading for Coding (powered by Grok)
      try {
        const xaiKey = import.meta.env.VITE_XAI_API_KEY;
        if (!xaiKey) throw new Error("XAI API key missing");

        const prompt = `Evaluate this code submission for the problem: "${test.questions[currentQ].title}".
        Description: ${test.questions[currentQ].description}
        Language: ${codeLang}
        Code:
        ${answers[currentQ] || ''}
        
        Return ONLY a JSON object: { "score": number (0-100), "feedback": "string" }. Score based on correctness and logic.`;

        const res = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${xaiKey}` },
          body: JSON.stringify({
            model: "grok-4-1-fast-non-reasoning",
            messages: [
              { role: "system", content: "You are a code evaluation assistant. Return only valid JSON." },
              { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2,
          }),
        });
        const data = await res.json();
        const text = (data.choices?.[0]?.message?.content || "").replace(/```json|```/g, '').trim();
        const evalData = JSON.parse(text);
        score = evalData.score;
        feedback = evalData.feedback;
      } catch (e) {
        console.error("Grading failed", e);
        score = 0; // Fallback
      }
    }

    // Fetch the full test data again to get passingScore and nextInterviewId
    const testDoc = await getDoc(doc(db, 'tests', testId!));
    const fullTestData = testDoc.data() as any;

    console.log('[Assessment] Score:', score, '| Passing Score:', fullTestData.passingScore);
    console.log('[Assessment] Next Interview ID:', fullTestData.nextInterviewId || 'none');
    console.log('[Assessment] External Link:', fullTestData.externalInterviewLink || 'none');

    let submissionStatus = (fullTestData.passingScore && score >= fullTestData.passingScore) ? 'passed' : 'failed';
    if (reason === 'terminated') submissionStatus = 'terminated';
    console.log('[Assessment] Status:', submissionStatus);

    // If passed and there's a next step, generate token and send email
    let emailSent = false;
    let emailError = '';

    if (submissionStatus === 'passed') {
      console.log('[Assessment] Candidate PASSED! Checking for next round...');

      // Internal AI Interview flow
      if (fullTestData.nextInterviewId) {
        console.log('[Assessment] Internal interview flow. Interview ID:', fullTestData.nextInterviewId);
        try {
          // Step 1: Fetch the interview details FIRST (read-only, allowed by rules)
          const interviewDoc = await getDoc(doc(db, 'interviews', fullTestData.nextInterviewId));
          if (!interviewDoc.exists()) {
            console.error('[Assessment] Interview document not found for ID:', fullTestData.nextInterviewId);
            emailError = 'Interview not found in database';
          } else {
            const interviewData = interviewDoc.data() as any;
            const nextRoundAccessCode = interviewData?.accessCode || '';
            const interviewTitle = interviewData?.title || test.title;
            // Build the interview link directly (no token needed for access-code-based interviews)
            const interviewLink = `${window.location.origin}/#/interview/${fullTestData.nextInterviewId}`;
            console.log('[Assessment] Interview title:', interviewTitle, '| Access code:', nextRoundAccessCode);
            console.log('[Assessment] Interview link:', interviewLink);

            // Step 2: Try to create a one-time access token (optional, may fail for anonymous users)
            let finalLink = interviewLink;
            try {
              const tokenDocRef = await addDoc(collection(db, 'interviewAccessTokens'), {
                testId,
                nextInterviewId: fullTestData.nextInterviewId,
                candidateEmail: candidateInfo.email,
                candidateName: candidateInfo.name,
                generatedAt: serverTimestamp(),
                isUsed: false,
              });
              finalLink = `${interviewLink}?token=${tokenDocRef.id}`;
              console.log('[Assessment] Token created. Final link:', finalLink);
            } catch (tokenErr) {
              console.warn('[Assessment] Token creation failed (permissions), using direct link instead:', tokenErr);
              // Continue with the direct interview link — the candidate can still use the access code
            }

            // Step 3: SEND THE EMAIL (this is the critical part)
            console.log('[Assessment] Sending email to:', candidateInfo.email);
            const emailResult = await sendInterviewInvitations(
              [candidateInfo.email],
              interviewTitle,
              finalLink,
              nextRoundAccessCode
            );

            console.log('[Assessment] Email result:', JSON.stringify(emailResult));
            emailSent = emailResult.success;
            if (!emailResult.success) emailError = emailResult.error || 'Failed to send email';
          }
        } catch (error: any) {
          console.error('[Assessment] Error in internal interview email flow:', error);
          emailError = error.message;
        }

      // External Link flow
      } else if (fullTestData.externalInterviewLink) {
        console.log('[Assessment] External link flow. Link:', fullTestData.externalInterviewLink);
        try {
          const emailResult = await sendInterviewInvitations(
            [candidateInfo.email],
            test.title,
            fullTestData.externalInterviewLink,
            fullTestData.externalAccessCode || ''
          );

          console.log('[Assessment] Email result:', JSON.stringify(emailResult));
          emailSent = emailResult.success;
          if (!emailResult.success) emailError = emailResult.error || 'Failed to send email';
        } catch (error: any) {
          console.error('[Assessment] Error in external interview email flow:', error);
          emailError = error.message;
        }
      } else {
        console.log('[Assessment] No next round configured (no nextInterviewId or externalInterviewLink).');
      }
    } else {
      console.log('[Assessment] Candidate did NOT pass. No email will be sent.');
    }

    console.log('[Assessment] Final email status - Sent:', emailSent, '| Error:', emailError || 'none');

    await addDoc(collection(db, 'testSubmissions'), {
      testId,
      candidateUID: user?.uid || candidateInfo.email,
      candidateName: candidateInfo.name,
      candidateEmail: candidateInfo.email,
      answers,
      score,
      feedback,
      status: submissionStatus,
      tabSwitchCount,
      emailSent,
      emailError,
      submittedAt: serverTimestamp()
    });

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(e => console.error(e));
    }

    setResultData({
      score,
      feedback,
      questions: test.questions,
      userAnswers: answers,
      type: test.type,
      status: submissionStatus,
      passingScore: fullTestData.passingScore
    });
    setSubmitting(false);

    // trigger promotional popup
    setTimeout(() => {
      setShowPromoPopup(true);
    }, 1500);
  };

  // Update ref in effect to avoid render side-effects
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  // Auto-submit on timeout
  useEffect(() => {
    if (timeLeft === 0 && step === 'test') {
      handleSubmitRef.current?.();
    }
  }, [timeLeft, step]);

  if (step === 'collect-info') {
    return <TestInfoForm onSubmit={(info) => {
      setCandidateInfo(info);
      setStep('test');
    }} />;
  }

  const renderFullscreenOverlay = () => {
    if (step === 'test' && !isFullscreen && !isTerminated && !submitting && !resultData) {
      return createPortal(
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex items-center justify-center p-6 text-white text-center">
          <div className="max-w-md p-8 bg-[#111] rounded-2xl border border-red-500/30 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-yellow-500"></div>
            <AlertTriangle size={48} className="mx-auto text-yellow-500 mb-4 animate-pulse" />
            <h2 className="text-2xl font-bold mb-4">Fullscreen Required</h2>
            <p className="text-gray-300 mb-6 font-medium text-sm leading-relaxed">
              {hasEnteredFullscreenRef.current 
                ? `You have exited fullscreen mode. The timer is paused. You have ${3 - fullscreenEscapes} escape(s) remaining before automatic termination.`
                : "This assessment must be taken in fullscreen mode to ensure a secure environment. Please enter fullscreen to start."}
            </p>
            <button 
              onClick={async () => {
                try {
                  const docEl = document.documentElement as any;
                  if (docEl.requestFullscreen) {
                    await docEl.requestFullscreen();
                  } else if (docEl.webkitRequestFullscreen) {
                    await docEl.webkitRequestFullscreen();
                  } else if (docEl.msRequestFullscreen) {
                    await docEl.msRequestFullscreen();
                  } else {
                    // Fallback for iOS/mobile devices that don't support fullscreen API
                    setIsFullscreen(true);
                    hasEnteredFullscreenRef.current = true;
                    return;
                  }
                } catch (err) {
                  console.error("Fullscreen error:", err);
                  // If browser denies request or it fails for whatever reason on mobile/desktop, grant fallback
                  // so the user is not permanently stuck.
                  setIsFullscreen(true);
                  hasEnteredFullscreenRef.current = true;
                }
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg hover:shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2"
            >
              <Terminal size={18} />
              {hasEnteredFullscreenRef.current ? "Return to Fullscreen" : "Enter Fullscreen & Start"}
            </button>
          </div>
        </div>,
        document.body
      );
    }
    return null;
  };

  if (resultData || step === 'finish') {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${isDark ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'}`}>
        <div className="max-w-3xl w-full bg-white dark:bg-[#111] rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-white/10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mb-4">
              <CheckCircle size={40} />
            </div>
            <h2 className="text-3xl font-bold mb-2">Assessment Completed</h2>
            <p className="text-gray-500 dark:text-gray-400">You scored <span className="text-blue-600 dark:text-blue-400 font-black text-xl">{resultData.score}%</span></p>
            {resultData.status === 'terminated' ? (
              <div className="mt-4 text-lg font-bold text-red-600 dark:text-red-500 bg-red-50 dark:bg-red-900/10 p-4 rounded-xl border border-red-200 dark:border-red-900/30">
                Assessment terminated due to security rule violations (left fullscreen).
              </div>
            ) : resultData.passingScore && (
              <div className={`mt-4 text-lg font-bold ${resultData.status === 'passed' ? 'text-green-500' : 'text-red-500'}`}>
                {resultData.status === 'passed' 
                  ? `Congratulations, you passed! (Passing score: ${resultData.passingScore}%)`
                  : `You did not meet the passing score of ${resultData.passingScore}%.`
                }
              </div>
            )}
            {resultData.status === 'passed' && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">An email with instructions for the next round has been sent to you.</p>
            )}
          </div>

          {resultData.type === 'coding' && resultData.feedback && (
            <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-xl border border-blue-100 dark:border-blue-800/30 mb-8">
              <h3 className="font-bold text-blue-700 dark:text-blue-300 mb-2">AI Feedback</h3>
              <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{resultData.feedback}</p>
            </div>
          )}

          {resultData.type === 'aptitude' && (
            <div className="space-y-4 mb-8 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
              <h3 className="font-bold border-b border-gray-200 dark:border-white/10 pb-2">Answer Key</h3>
              {resultData.questions.map((q: any, i: number) => {
                const isCorrect = resultData.userAnswers[i] === q.correctIndex;
                return (
                  <div key={i} className={`p-4 rounded-xl border ${isCorrect ? 'border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800' : 'border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800'}`}>
                    <p className="font-medium mb-2 text-sm"><span className="opacity-50 mr-2">Q{i + 1}.</span> {q.question}</p>
                    <div className="flex flex-col sm:flex-row sm:justify-between text-xs gap-2">
                      <span className={`font-bold ${isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                        Your Answer: {q.options[resultData.userAnswers[i]] || 'Skipped'}
                      </span>
                      {!isCorrect && (
                        <span className="text-gray-500 dark:text-gray-400">Correct: {q.options[q.correctIndex]}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-center mt-6">
            <button onClick={() => navigate('/')} className="px-8 py-3 bg-gray-900 dark:bg-white text-white dark:text-black rounded-xl font-bold hover:opacity-90 transition-opacity shadow-lg">
              Return to Portal
            </button>
          </div>

          {/* Promotional Popup for the main platform */}
          {showPromoPopup && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.5s_ease-out]">
              <div className="bg-white dark:bg-[#111] border border-blue-500/30 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden transform animate-[slideInUp_0.4s_ease-out]">
                {/* Glow effects */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/20 blur-3xl rounded-full"></div>
                <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-500/20 blur-3xl rounded-full"></div>
                
                <div className="relative z-10 text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/30 transform rotate-3">
                    <i className="fa-solid fa-rocket text-2xl"></i>
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-3">Assessment Submitted</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm mb-6 leading-relaxed">
                    Your response has been recorded. If this assessment qualifies you for a next round, the recruiter will contact you using the details you provided.
                  </p>
                  
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => navigate('/')}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg transform transition-all hover:-translate-y-0.5"
                    >
                      Return to Portal
                    </button>
                    <button 
                      onClick={() => navigate('/submit-review')}
                      className="w-full py-3.5 bg-gradient-to-r from-pink-500 to-orange-400 hover:from-pink-600 hover:to-orange-500 text-white rounded-xl font-bold shadow-lg transform transition-all hover:-translate-y-0.5 flex justify-center items-center gap-2"
                    >
                      <i className="fa-solid fa-star text-yellow-300 drop-shadow-md"></i> Give Review
                    </button>
                    <button 
                      onClick={() => setShowPromoPopup(false)}
                      className="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-[#1a1a1a] dark:hover:bg-[#222] text-gray-700 dark:text-gray-300 rounded-xl font-bold transition-colors"
                    >
                      Maybe Later
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  if (!test) return (
    <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );

  if (!test.questions || test.questions.length === 0) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center ${isDark ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'}`}>
        <p className="text-xl mb-4">This test has no questions.</p>
        <button onClick={() => navigate('/')} className="text-blue-500 hover:underline">Go Back</button>
      </div>
    );
  }

  const question = test.questions?.[currentQ];

  if (!question) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'}`}>
        <p>Error loading question.</p>
        <button onClick={() => navigate('/')} className="ml-4 text-blue-500 hover:underline">Go Back</button>
      </div>
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div 
      className={`min-h-screen flex flex-col select-none ${isDark ? 'bg-[#050505] text-white' : 'bg-gray-50 text-gray-900'}`}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      {renderFullscreenOverlay()}
      {showCalculator && <Calculator onClose={() => setShowCalculator(false)} />}

      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-[#111] flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="text-center sm:text-left">
          <h1 className="text-lg sm:text-xl font-bold">{test.title}</h1>
          <p className="text-sm text-gray-500">Question {currentQ + 1} of {test.questions.length}</p>
        </div>
        <div className="flex items-center flex-wrap justify-center gap-2 sm:gap-4">
          {timeLeft !== null && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold ${timeLeft < 60 ? 'text-red-600 bg-red-50 dark:bg-red-900/20' : 'text-gray-600 bg-gray-50 dark:bg-gray-700/20'}`}>
              <Clock size={16} /> <span className="hidden sm:inline">Time:</span> {formatTime(timeLeft)}
            </div>
          )}
          <div className="hidden md:flex items-center gap-2 text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold">
            <AlertTriangle size={16} /> No Copy Paste
          </div>
          <button onClick={() => setShowCalculator(true)} className="flex items-center gap-2 text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold cursor-pointer">
            <CalculatorIcon size={16} /> <span className="hidden sm:inline">Calculator</span>
          </button>
        </div>
      </div>

      {showWarning && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg animate-bounce">
          <AlertTriangle size={16} className="inline mr-2" />
          Tab switching is monitored.
        </div>
      )}

      {/* Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 md:p-6 min-h-0">
        {/* Main Question Area */}
        <div className="lg:col-span-9 flex flex-col min-h-0">
          {test.type === 'aptitude' ? ( // APTITUDE VIEW
            <div className="bg-white dark:bg-[#111] p-8 rounded-2xl shadow-sm border border-gray-200 dark:border-white/10">
              <h2 className="text-xl font-bold mb-6">{question.question || 'Question text missing'}</h2>
              <div className="space-y-3">
                {question.options?.map((opt: string, i: number) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${answers[currentQ] === i
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-700 dark:text-blue-300'
                      : 'bg-gray-50 dark:bg-[#1a1a1a] border-transparent hover:bg-gray-100 dark:hover:bg-white/5'
                      }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ) : ( // CODING VIEW
            <>
              {/* Desktop Grid View */}
              <div className="hidden lg:grid grid-cols-5 gap-6 h-full min-h-0">
                <div className="lg:col-span-2 h-full">
                  <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/10 flex flex-col overflow-hidden shadow-sm h-full">
                    <div className="p-4 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#161616] flex items-center gap-2">
                      <FileCode size={18} className="text-blue-500" />
                      <h2 className="font-bold text-gray-800 dark:text-white">Problem Description</h2>
                    </div>
                    <div className="p-6 overflow-y-auto flex-1 prose dark:prose-invert max-w-none">
                      <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{question.title || 'Problem Title'}</h3>
                      <div className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap mb-6 text-sm leading-relaxed">
                        {question.description || 'No description provided.'}
                      </div>
                      <div className="mt-6">
                        <h4 className="text-sm font-bold uppercase text-gray-500 dark:text-gray-400 mb-3 tracking-wider">Test Cases</h4>
                        <div className="bg-gray-50 dark:bg-[#1a1a1a] p-4 rounded-xl border border-gray-200 dark:border-white/5 font-mono text-sm text-gray-700 dark:text-gray-300">
                          {question.testCases || 'No test cases provided.'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="lg:col-span-3 h-full">
                  <div className="flex flex-col bg-[#1e1e1e] rounded-2xl overflow-hidden border border-gray-700 shadow-2xl h-full">
                    <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333]">
                      <div className="flex items-center gap-4">
                        <select value={codeLang} onChange={e => setCodeLang(e.target.value)} className="bg-[#333] text-gray-200 text-xs rounded px-2 py-1 border border-[#444] focus:outline-none focus:border-blue-500 hover:bg-[#3c3c3c] transition-colors cursor-pointer">
                          <option value="javascript">JavaScript</option>
                          <option value="python">Python</option>
                          <option value="java">Java</option>
                          <option value="cpp">C++</option>
                        </select>
                      </div>
                      <button className="p-1.5 hover:bg-[#333] rounded text-gray-400 hover:text-white transition-colors" title="Settings"><Settings size={14} /></button>
                    </div>
                    <div className="flex-1 relative"><textarea value={answers[currentQ] || ''} onChange={e => handleAnswer(e.target.value)} onPaste={e => e.preventDefault()} className="w-full h-full p-4 bg-[#1e1e1e] text-gray-300 font-mono text-sm resize-none outline-none leading-6" placeholder={`// Write your ${codeLang} solution here...`} spellCheck={false} style={{ tabSize: 2 }} /></div>
                    <div className="bg-[#252526] border-t border-[#333]"><div className="flex items-center justify-between px-4 py-2"><div className="flex items-center gap-2 text-xs text-gray-400"><Terminal size={12} /><span>Console</span></div><button className="flex items-center gap-2 px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded transition-colors"><Play size={12} /> Run</button></div></div>
                  </div>
                </div>
              </div>

              {/* Mobile Tab View */}
              <div className="lg:hidden flex flex-col h-full">
                <div className="flex-shrink-0">
                  <div className="flex border-b border-gray-200 dark:border-white/10">
                    <button onClick={() => setActiveCodeTab('problem')} className={`px-4 py-2 font-bold text-sm ${activeCodeTab === 'problem' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-500'}`}>Problem</button>
                    <button onClick={() => setActiveCodeTab('code')} className={`px-4 py-2 font-bold text-sm ${activeCodeTab === 'code' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-500'}`}>Code</button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 py-4">
                  {activeCodeTab === 'problem' ? (
                    <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/10 flex flex-col overflow-hidden shadow-sm h-full">
                      <div className="p-4 overflow-y-auto flex-1 prose dark:prose-invert max-w-none">
                        <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-white">{question.title || 'Problem Title'}</h3>
                        <div className="text-gray-600 dark:text-gray-300 whitespace-pre-wrap mb-4 text-sm leading-relaxed">{question.description || 'No description provided.'}</div>
                        <h4 className="text-xs font-bold uppercase text-gray-500 dark:text-gray-400 mb-2 tracking-wider">Test Cases</h4>
                        <div className="bg-gray-50 dark:bg-[#1a1a1a] p-3 rounded-xl border border-gray-200 dark:border-white/5 font-mono text-xs text-gray-700 dark:text-gray-300">{question.testCases || 'No test cases provided.'}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col bg-[#1e1e1e] rounded-2xl overflow-hidden border border-gray-700 shadow-2xl h-full">
                      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333]">
                        <select value={codeLang} onChange={e => setCodeLang(e.target.value)} className="bg-[#333] text-gray-200 text-xs rounded px-2 py-1 border border-[#444] focus:outline-none focus:border-blue-500 hover:bg-[#3c3c3c] transition-colors cursor-pointer">
                          <option value="javascript">JavaScript</option>
                          <option value="python">Python</option>
                          <option value="java">Java</option>
                          <option value="cpp">C++</option>
                        </select>
                        <button className="flex items-center gap-2 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded transition-colors"><Play size={12} /> Run</button>
                      </div>
                      <div className="flex-1 relative"><textarea value={answers[currentQ] || ''} onChange={e => handleAnswer(e.target.value)} onPaste={e => e.preventDefault()} className="w-full h-full p-4 bg-[#1e1e1e] text-gray-300 font-mono text-sm resize-none outline-none leading-6" placeholder={`// Write your ${codeLang} solution here...`} spellCheck={false} style={{ tabSize: 2 }} /></div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Question Palette */}
        <div className="lg:col-span-3 bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/10 shadow-sm p-4 flex flex-col">
          <h3 className="font-bold mb-4 text-center">Question Palette</h3>
          <div className="grid grid-cols-6 sm:grid-cols-5 gap-2 flex-1">
            {test.questions.map((_: any, i: number) => {
              const isAnswered = answers[i] !== undefined && answers[i] !== '';
              const isMarked = markedQuestions[i];
              const isCurrent = currentQ === i;

              let statusClass = 'bg-gray-100 dark:bg-[#1a1a1a] text-gray-500 dark:text-gray-400 border-transparent';
              if (isCurrent) statusClass = 'bg-blue-500 text-white border-blue-700 ring-2 ring-blue-300';
              else if (isAnswered) statusClass = 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/50';

              return (
                <button
                  key={i}
                  onClick={() => setCurrentQ(i)}
                  className={`relative w-full aspect-square rounded-lg border text-sm font-bold flex items-center justify-center transition-all ${statusClass}`}
                >
                  {i + 1}
                  {isMarked && <Flag size={10} className="absolute -top-1 -right-1 text-red-500" fill="currentColor" />}
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-xs text-gray-500 space-y-1">
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-100 border border-green-200"></div> Answered</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-gray-100 border border-gray-200"></div> Not Answered</div>
            <div className="flex items-center gap-2"><Flag size={10} className="text-red-500" fill="currentColor" /> Marked for Review</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 md:p-6 border-t border-gray-200 dark:border-white/10 bg-white dark:bg-[#111] flex flex-wrap items-center justify-center md:justify-end gap-4">
        <button onClick={handleMarkForReview} className={`order-last md:order-first px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors ${markedQuestions[currentQ] ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'}`}>
          <Flag size={16} /> Mark for Review
        </button>
        <div className="flex-grow md:flex-grow-0"></div>
        <div className="flex items-center gap-3">
          {currentQ > 0 && <button onClick={() => setCurrentQ(c => c - 1)} className="px-6 py-2.5 rounded-xl font-bold text-gray-500 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10">Previous</button>}
          {currentQ < test.questions.length - 1 ? (
            <button onClick={() => setCurrentQ(c => c + 1)} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700">Next</button>
          ) : (
            <button onClick={() => handleSubmit()} disabled={submitting} className="px-8 py-2.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit Test'}</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TakeTest;
