import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import gsap from 'gsap';
import { useTheme } from '../context/ThemeContext';
import Logo from '../components/Logo';
import { Timer, MonitorOff, ShieldAlert, Copy } from 'lucide-react';

const TestAccess: React.FC = () => {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [accessCode, setAccessCode] = useState('');
  const [testDetails, setTestDetails] = useState<{ title: string, duration: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const containerRef = useRef(null);

  useEffect(() => {
    const fetchTestDetails = async () => {
      if (!testId) return;
      try {
        const testDoc = await getDoc(doc(db, 'tests', testId));
        if (testDoc.exists()) {
          const testData = testDoc.data() as any;
          setTestDetails({
            title: testData.title || 'Assessment',
            duration: testData.duration || 0
          });
        } else {
          setError('Assessment not found.');
        }
      } catch (err) {
        setError('Failed to fetch Assessment details.');
      }
    };
    fetchTestDetails();
  }, [testId]);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current, 
        { opacity: 0, y: 30 }, 
        { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }
      );
    }
  }, []);

  const handleStartTest = async () => {
    if (!accessCode.trim()) {
      setError('Please enter an access code.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      if (!testId) {
        throw new Error('Test ID is missing.');
      }
      const testDoc = await getDoc(doc(db, 'tests', testId));

      if (testDoc.exists()) {
        const testData = testDoc.data() as any;
        if (accessCode.trim().toUpperCase() === (testData.accessCode || '').toUpperCase()) {
          navigate(`/test/start/${testId}`);
        } else {
          setError('Invalid access code. Please try again.');
          gsap.fromTo(".access-container", { x: -10 }, { x: 10, repeat: 3, yoyo: true, duration: 0.1, ease: 'power1.inOut', onComplete: () => gsap.to(".access-container", {x: 0}) });
        }
      } else {
        setError('This assessment is no longer available.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again later.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const rules = [
    { icon: Timer, text: `The test is timed for ${testDetails?.duration || 'a specific'} minutes.` },
    { icon: MonitorOff, text: 'Fullscreen mode will be enabled automatically.' },
    { icon: ShieldAlert, text: 'Switching tabs is not allowed and will be flagged.' },
    { icon: Copy, text: 'Copying and pasting content is disabled.' },
  ];

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-4 ${isDark ? 'bg-[#0a0a0f]' : 'bg-gray-50'}`}>
      <div className="absolute top-6 left-6">
        <Logo className="w-[118px] sm:w-[140px] h-auto" isDark={isDark} />
      </div>
      
      <div ref={containerRef} className="access-container w-full max-w-lg p-6 md:p-10 space-y-6 bg-white dark:bg-[#111] rounded-2xl shadow-2xl border border-gray-100 dark:border-white/10">
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">Assessment Access</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            You are about to start the assessment for: <strong className="text-blue-600 dark:text-blue-400">{testDetails?.title || '...'}</strong>
          </p>
        </div>

        {/* Rules Section */}
        <div className="p-5 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-200 dark:border-white/10">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 uppercase tracking-wider">Rules of the Assessment</h3>
          <ul className="space-y-3">
            {rules.map((rule, index) => (
              <li key={index} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
                <rule.icon className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" />
                <span>{rule.text}</span>
              </li>
            ))}
          </ul>
        </div>
        
        {error && (
          <p className="text-red-500 bg-red-100 dark:bg-red-900/20 p-3 rounded-lg text-sm font-medium">{error}</p>
        )}

        {testDetails ? (
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-white/10">
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 text-center">Enter Access Code</label>
            <input
              type="text"
              placeholder="••••••"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-4 bg-gray-50 dark:bg-[#1a1a1a] border-2 border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-center text-2xl tracking-[0.5em] font-mono"
            />
            <button 
              onClick={handleStartTest}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying...
                </>
              ) : 'Access Assessment'}
            </button>
          </div>
        ) : (
          !error && <p className="text-center text-gray-500">Loading assessment details...</p>
        )}
      </div>
    </div>
  );
};

export default TestAccess;
