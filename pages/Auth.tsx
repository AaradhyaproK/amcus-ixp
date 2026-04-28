import React, { useState, useEffect, useRef } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { doc, serverTimestamp, addDoc, collection, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { useNavigate, Link } from 'react-router-dom';
import gsap from 'gsap';
import { BackgroundPaths } from '../components/landing/FloatingPaths';
import Logo from '../components/Logo';
import { Mail, Bug } from 'lucide-react';

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isReset, setIsReset] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showVerifyPopup, setShowVerifyPopup] = useState(false);
  const [showVerifyErrorPopup, setShowVerifyErrorPopup] = useState(false);
  const navigate = useNavigate();

  // Animation Refs
  const logoRef = useRef<HTMLImageElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // GSAP Animation Context
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(logoRef.current,
        { opacity: 0, scale: 0.8, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 1, delay: 0.2 }
      )
        .fromTo(titleRef.current,
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.8 },
          "-=0.6"
        )
        .fromTo(descRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.8 },
          "-=0.6"
        )
        .fromTo(featuresRef.current?.children || [], // Target children of features container
          { opacity: 0, x: -20 },
          { opacity: 1, x: 0, duration: 0.6, stagger: 0.2 },
          "-=0.4"
        );
    });

    return () => ctx.revert();
  }, []);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullname, setFullname] = useState('');
  const [experience, setExperience] = useState(0);
  const [rememberMe, setRememberMe] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      // Set persistence based on rememberMe state
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);

      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      if (!userCredential.user.emailVerified) {
        // Check if admin verified manually in Firestore
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        if (!userDoc.exists() || !userDoc.data().adminVerified) {
          await signOut(auth);
          setShowVerifyErrorPopup(true);
          return;
        }
      }

      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      const userRole = userDoc.data()?.role;
      if (userRole !== 'recruiter' && userRole !== 'admin') {
        await signOut(auth);
        setError('This Dsauce portal is only for recruiters and admins. Candidates should use the interview or assessment link sent to them.');
        return;
      }

      navigate('/');
    } catch (err: any) {
      setError("Login failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await addDoc(collection(db, 'recruiterRequests'), {
        email,
        fullname,
        experience: Number(experience),
        role: 'recruiter',
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setMessage("Request sent! An admin will review your recruiter access request and create your account once approved.");
      setIsLogin(true);
    } catch (err: any) {
      setError("Request failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Password reset email sent! Check your inbox and your spam/junk folder.");
      setIsReset(false);
      setIsLogin(true);
    } catch (err: any) {
      setError("Reset failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative bg-background text-foreground font-sans selection:bg-primary/20">

      {/* Background Ambience */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20 dark:opacity-100 transition-opacity">
        <BackgroundPaths />
      </div>

      <div className="flex-grow flex items-center justify-center p-4 sm:p-6 relative z-10">
        <div className="auth-card w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-0 rounded-[14px] overflow-hidden min-h-[550px]">

          {/* Left Side - Form Section */}
          <div className="auth-panel flex flex-col justify-center p-8 md:p-10 relative">

            <div className="w-full max-w-sm mx-auto">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-[22px] font-semibold tracking-tight mb-2 text-white">
                  {isReset ? 'Reset Password' : isLogin ? 'Welcome back!' : 'Request recruiter access'}
                </h1>
                <p className="text-zinc-400 text-sm">
                  {isReset
                    ? 'Enter your email to receive a reset link'
                    : isLogin
                      ? 'Login to access the Dsauce recruiter or admin portal'
                      : 'Submit your details for recruiter account approval'}
                </p>
              </div>

              {/* Alerts */}
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-200 text-xs rounded-lg flex items-center gap-2 animate-fade-in">
                  <i className="fa-solid fa-circle-exclamation text-red-400"></i>
                  {error}
                </div>
              )}

              {message && (
                <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-xs rounded-lg flex items-center gap-2 animate-fade-in">
                  <i className="fa-solid fa-check-circle text-emerald-400"></i>
                  {message}
                </div>
              )}

              {/* Form Config */}
              {isReset ? (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="saas-ui-mono text-xs font-medium text-zinc-300 ml-1">Email</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-primary transition-colors">
                        <i className="fa-regular fa-envelope text-sm"></i>
                      </div>
                      <input
                        type="email"
                        required
                        className="w-full pl-9 pr-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all hover:border-zinc-700"
                        placeholder="Enter your mail address"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-[12px] text-white text-sm font-semibold transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsReset(false)}
                    className="w-full text-zinc-500 hover:text-white text-xs font-medium transition-colors"
                  >
                    Back to login
                  </button>
                </form>
              ) : (
                <form onSubmit={isLogin ? handleLogin : handleSignup} className="space-y-4">

                  {/* Signup Specific Fields */}
                  {!isLogin && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5 col-span-2">
                          <label className="saas-ui-mono text-xs font-medium text-zinc-300 ml-1">Full Name</label>
                          <input
                            type="text"
                            required
                            className="w-full px-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all hover:border-zinc-700"
                            placeholder="John Doe"
                            value={fullname}
                            onChange={e => setFullname(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5 col-span-2">
                          <label className="saas-ui-mono text-xs font-medium text-zinc-300 ml-1">Experience (Yrs)</label>
                          <input
                            type="number"
                            min="0"
                            required
                            className="w-full px-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all hover:border-zinc-700"
                            value={experience}
                            onChange={e => setExperience(Number(e.target.value))}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Standard Fields */}
                  <div className="space-y-1.5">
                    <label className="saas-ui-mono text-xs font-medium text-zinc-300 ml-1">Email</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-primary transition-colors">
                        <i className="fa-regular fa-envelope text-sm"></i>
                      </div>
                      <input
                        type="email"
                        required
                        className="w-full pl-9 pr-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all hover:border-zinc-700"
                        placeholder="Enter your mail address"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  {isLogin && (
                    <>
                      <div className="space-y-1.5">
                        <label className="saas-ui-mono text-xs font-medium text-zinc-300 ml-1">Password</label>
                        <div className="relative group">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500 group-focus-within:text-primary transition-colors">
                            <i className="fa-solid fa-lock text-sm"></i>
                          </div>
                          <input
                            type="password"
                            required
                            minLength={6}
                            className="w-full pl-9 pr-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all hover:border-zinc-700"
                            placeholder="Enter password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                          />
                        </div>
                      </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div className={`w-3.5 h-3.5 rounded border transition-colors flex items-center justify-center ${rememberMe ? 'border-primary bg-primary' : 'border-zinc-700 bg-zinc-800 group-hover:border-primary'}`}>
                          {rememberMe && <i className="fa-solid fa-check text-[8px] text-white"></i>}
                        </div>
                        <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">Remember me</span>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsReset(true)}
                        className="text-xs text-primary hover:text-primary-dark transition-colors font-medium"
                      >
                        Forgot password?
                      </button>
                    </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-[12px] text-white font-semibold transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed mt-4 text-sm tracking-wide"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                        Processing...
                      </span>
                    ) : (
                      isLogin ? 'Log in' : 'Submit Request'
                    )}
                  </button>

                  <div className="relative pt-3">
                    <div className="absolute inset-0 flex items-center">
                      <div className="auth-divider w-full border-t border-zinc-800"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="auth-divider-label px-2 bg-[#0a0a0a] text-zinc-500">Or continue with</span>
                    </div>
                  </div>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setIsLogin(!isLogin)}
                      className="text-zinc-400 hover:text-white transition-colors text-xs"
                    >
                      {isLogin ? "Need recruiter access? " : "Already have portal access? "}
                      <span className="text-primary font-semibold hover:underline ml-1">
                        {isLogin ? "Request it" : "Log in"}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="mt-8 text-center">
              <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-xs">
                <i className="fa-solid fa-arrow-left"></i> Back to Homepage
              </Link>
            </div>
          </div>

          {/* Right Side - Visual / Image */}
          <div className="hidden md:block relative overflow-hidden bg-black h-full">
            {/* Abstract Gradient Background imitating the 'Purple Swirl' */}
            <div className="absolute inset-0 bg-gradient-to-br from-violet-900/40 via-black to-black z-0"></div>

            {/* The 'Swirl' Construction using CSS Blurs */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] z-10 pointer-events-none">
              <div className="absolute top-[30%] left-[20%] w-[300px] h-[300px] bg-indigo-600 rounded-full blur-[80px] mix-blend-screen opacity-60 animate-pulse-slow"></div>
              <div className="absolute top-[40%] right-[20%] w-[400px] h-[400px] bg-violet-700 rounded-full blur-[100px] mix-blend-screen opacity-60"></div>
              <div className="absolute bottom-[20%] left-[30%] w-[350px] h-[350px] bg-fuchsia-800 rounded-full blur-[90px] mix-blend-screen opacity-50"></div>

              {/* Thin lines resembling the flow */}
              <div className="absolute top-[40%] left-[10%] content-[''] w-[120%] h-[400px] border-[1px] border-white/5 rounded-[100%] rotate-[30deg] blur-[1px]"></div>
              <div className="absolute top-[45%] left-[15%] content-[''] w-[110%] h-[350px] border-[1px] border-white/5 rounded-[100%] rotate-[30deg] blur-[1px]"></div>
              <div className="absolute top-[50%] left-[20%] content-[''] w-[100%] h-[300px] border-[1px] border-white/10 rounded-[100%] rotate-[30deg] blur-[2px]"></div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-8 z-20 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col justify-end h-full pointer-events-none">
              <div className="p-4 flex flex-col h-full justify-center relative z-30">

                <img
                  ref={logoRef}
                  src="/logo-partnership-dark.png"
                  alt="InterviewXpert X DSource partnership logo"
                  className="w-56 max-w-full h-auto mb-6 shadow-xl shadow-cyan-500/10 opacity-0"
                />

                <h3
                  ref={titleRef}
                  className="text-3xl font-bold text-white mb-4 leading-tight opacity-0"
                >
                  Master Your <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500">Next Interview</span>
                </h3>

                <p
                  ref={descRef}
                  className="text-zinc-400 text-base leading-relaxed max-w-lg mb-8 opacity-0"
                >
                  Manage Dsauce hiring workflows, recruiter access, and admin operations from one secure portal.
                </p>

                <div ref={featuresRef} className="space-y-4">
                  <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl backdrop-blur-md border border-white/10 opacity-0 transform translate-x-4">
                    <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 shadow-lg shadow-green-900/20">
                      <i className="fa-solid fa-check text-base"></i>
                    </div>
                    <div>
                      <span className="block text-white font-semibold text-sm">Real-time AI Feedback</span>
                      <span className="text-zinc-500 text-xs">Review structured interview and assessment outcomes faster</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl backdrop-blur-md border border-white/10 opacity-0 transform translate-x-4">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400 shadow-lg shadow-yellow-900/20">
                      <i className="fa-solid fa-bolt text-base"></i>
                    </div>
                    <div>
                      <span className="block text-white font-semibold text-sm">Instant Performance Score</span>
                      <span className="text-zinc-500 text-xs">Track invite-driven hiring progress with less manual effort</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Footer - Minimal */}
      <footer className="relative z-10 py-6 text-center border-t border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-6 mb-4">
          <Link to="/contact" className="group flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <span className="p-1.5 rounded-lg bg-muted group-hover:bg-secondary transition-colors ring-1 ring-border">
              <Mail size={14} />
            </span>
            Contact Support
          </Link>
          <div className="w-px h-4 bg-border"></div>
          <Link to="/report-bug" className="group flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-red-500 transition-colors">
            <span className="p-1.5 rounded-lg bg-muted group-hover:bg-red-500/10 transition-colors ring-1 ring-border">
              <Bug size={14} />
            </span>
            Report Issue
          </Link>
        </div>
        <p className="text-[10px] text-muted-foreground">
          &copy; {new Date().getFullYear()} InterviewXpert. Designed by <span className="text-foreground">Team Interview Expert</span>.
        </p>
      </footer>

      {/* Verify Email Popup */}
      {showVerifyPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="saas-modal-card border border-white/10 rounded-[12px] p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fa-regular fa-envelope-open text-2xl"></i>
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">Account Created!</h3>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
              We've sent a verification link to your email. <strong className="text-foreground">Please check your inbox (and spam/junk folder)</strong>, verify your email address, and then log in.
            </p>
            <button 
              onClick={() => setShowVerifyPopup(false)}
              className="saas-btn-primary w-full py-3 rounded-[12px] font-bold transition-colors"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}

      {/* Unverified Email Login Error Popup */}
      {showVerifyErrorPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="saas-modal-card border border-red-500/20 rounded-[12px] p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">Email Not Verified</h3>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
              You must verify your email before logging in. <strong className="text-foreground">Please check your inbox and spam/junk folder</strong> for the verification link.
              <br /><br />
              If you did not receive a link, please fill out the Contact Form to have an admin manually verify your account.
            </p>
            <div className="flex flex-col gap-3">
              <Link 
                to="/contact"
                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-colors block text-center"
              >
                Go to Contact Form
              </Link>
              <button 
                onClick={() => setShowVerifyErrorPopup(false)}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
};

export default AuthPage;
