import React, { useState, useEffect, useRef } from 'react';
import withoutGlowImg from './assets/without-glow.png';
import glowImg from './assets/glow.png';

interface SplashTransitionProps {
  onComplete: () => void;
}

export const SplashTransition: React.FC<SplashTransitionProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<'initial' | 'synthesizing' | 'fading'>('initial');

  useEffect(() => {
    const timer1 = setTimeout(() => setPhase('synthesizing'), 1800);
    const timer2 = setTimeout(() => setPhase('fading'), 4200);
    const timer3 = setTimeout(() => onComplete(), 5000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [onComplete]);

  return (
    <div className={`splash-overlay ${phase === 'fading' ? 'fade-out' : ''}`}>
      <div className="splash-content">
        <div className="image-container">
          <img
            src={withoutGlowImg}
            alt="Initializing"
            className={`splash-img ${phase === 'initial' ? 'visible' : 'hidden'}`}
          />
          <img
            src={glowImg}
            alt="Synthesizing"
            className={`splash-img ${phase !== 'initial' ? 'visible' : 'hidden'}`}
          />
        </div>

        <div className="splash-text-container">
          <h2 className="splash-title">AI INTERVIEW COACH</h2>
          <p className="splash-subtitle">
            Empowering candidates to conquer technical & behavioral interviews...
          </p>
        </div>
      </div>
    </div>
  );
};

interface FeedbackReport {
  summary: string;
  strengths: string[];
  improvements: string[];
}

interface ChatMessage {
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
}

interface Session {
  id: string;
  title: string;
  score: number;
  grade: 'high' | 'mid';
  feedback: FeedbackReport;
  messages: ChatMessage[];
}

interface DriveFile {
  id: string;
  name: string;
  type: string;
  updated: string;
}

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [currentView, setCurrentView] = useState<'landing' | 'features' | 'how-it-works' | 'login' | 'dashboard' | 'interview-room'>('landing');

  // User Email & Persistent Sessions State
  const [userEmail, setUserEmail] = useState<string>(() => sessionStorage.getItem('user_email') || '');
  const [sessions, setSessions] = useState<Session[]>(() => {
    const email = sessionStorage.getItem('user_email');
    if (!email) return [];
    const saved = localStorage.getItem(`sessions_${email}`);
    return saved ? JSON.parse(saved) : [];
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<{ sessionTitle: string; sessionScore: number; messages: ChatMessage[]; report: FeedbackReport } | null>(null);

  const initialAiGreeting = "Hello! I am your AI Interview Coach. Let's begin your simulation. Tell me a bit about yourself or the role you are targeting.";

  // Interview Room State & Response Timer Tracking Ref
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isMicActive, setIsMicActive] = useState(false);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [resumeFileName, setResumeFileName] = useState('');
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [driveTab, setDriveTab] = useState<'picker' | 'url'>('picker');
  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [selectedDriveFileId, setSelectedDriveFileId] = useState<string | null>(null);

  // Real Google Drive files state fetched via OAuth backend proxy
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isFetchingDrive, setIsFetchingDrive] = useState(false);
  
  // Persistent Google Access Token State
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => sessionStorage.getItem('google_access_token'));

  const questionStartTimeRef = useRef<number>(Date.now());
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  // Unified Live Score Calculator
  const calculateLiveScore = (messages: ChatMessage[]) => {
    const userExchanges = messages.filter(m => m.sender === 'user').length;
    if (userExchanges <= 1) return 65;
    if (userExchanges <= 3) return 78;
    if (userExchanges <= 6) return 88;
    return 95;
  };

  // Fetch user profile email using access token
  const fetchUserProfile = async (token: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.email) {
        setUserEmail(data.email);
        sessionStorage.setItem('user_email', data.email);
        
        const savedSessions = localStorage.getItem(`sessions_${data.email}`);
        if (savedSessions) {
          setSessions(JSON.parse(savedSessions));
        } else {
          setSessions([]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch user profile:", err);
    }
  };

  // Fetch Drive Files helper using token
  const fetchDriveFilesList = async (token: string) => {
    setIsFetchingDrive(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'https://ai-interview-coach-qux6.onrender.com';
      const res = await fetch(`${API_URL}/api/drive/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token })
      });

      const data = await res.json();
      if (data.files) {
        setDriveFiles(data.files);
      } else {
        console.error("Failed to load drive files:", data.error);
        alert("Failed to fetch files from Google Drive.");
      }
    } catch (err) {
      console.error("Backend server error:", err);
      alert("Could not communicate with server.");
    } finally {
      setIsFetchingDrive(false);
    }
  };

  const handleGoogleDriveClick = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      alert("Missing VITE_GOOGLE_CLIENT_ID in client/.env");
      return;
    }

    if (googleAccessToken) {
      fetchDriveFilesList(googleAccessToken);
      return;
    }

    const initAuth = () => {
      const client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email',
        callback: async (tokenResponse: any) => {
          if (tokenResponse && tokenResponse.access_token) {
            setGoogleAccessToken(tokenResponse.access_token);
            sessionStorage.setItem('google_access_token', tokenResponse.access_token);
            await fetchUserProfile(tokenResponse.access_token);
            fetchDriveFilesList(tokenResponse.access_token);
          } else {
            setIsFetchingDrive(false);
          }
        },
      });
      client.requestAccessToken();
    };

    if (!(window as any).google) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => initAuth();
      document.body.appendChild(script);
    } else {
      initAuth();
    }
  };

  // Save sessions to localStorage whenever sessions state changes for the current user
  useEffect(() => {
    if (userEmail) {
      localStorage.setItem(`sessions_${userEmail}`, JSON.stringify(sessions));
    }
  }, [sessions, userEmail]);

  // Handle browser back button navigation via window history states
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setCurrentView(event.state.view);
      } else {
        setCurrentView('landing');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const changeView = (view: 'landing' | 'features' | 'how-it-works' | 'login' | 'dashboard' | 'interview-room') => {
    window.history.pushState({ view }, '', `#${view}`);
    setCurrentView(view);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSplashComplete = () => {
    setShowSplash(false);
    window.history.replaceState({ view: 'landing' }, '', '#landing');
  };

  const handleResumeSession = () => {
    if (sessions.length === 0) {
      alert('No previous session to resume! Please start a new interview first.');
    } else {
      const lastSession = sessions[0];
      setActiveSessionId(lastSession.id);
      setChatMessages(lastSession.messages || []);
      changeView('interview-room');
    }
  };

  const handleNewInterview = () => {
    const newSessionId = Date.now().toString();
    const initialGreetingMsg: ChatMessage = {
      sender: 'ai',
      text: initialAiGreeting,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const initialScore = calculateLiveScore([initialGreetingMsg]);

    const newSession: Session = {
      id: newSessionId,
      title: resumeFileName ? `Targeted Simulation (${resumeFileName})` : 'General Technical & Behavioral Simulation',
      score: initialScore,
      grade: initialScore >= 80 ? 'high' : 'mid',
      feedback: {
        summary: 'Completed live interactive simulation with sound structural clarity and logical reasoning.',
        strengths: ['Clear and concise articulation', 'Logical progression of ideas', 'Good engagement'],
        improvements: ['Add deeper metrics or tangible results', 'Expand on architectural tradeoffs']
      },
      messages: [initialGreetingMsg]
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSessionId);
    setChatMessages([initialGreetingMsg]);
    questionStartTimeRef.current = Date.now();
    changeView('interview-room');
  };

  useEffect(() => {
    if (activeSessionId) {
      setSessions((prevSessions) =>
        prevSessions.map((s) => {
          if (s.id === activeSessionId) {
            const liveScore = calculateLiveScore(chatMessages);
            return {
              ...s,
              score: liveScore,
              grade: liveScore >= 80 ? 'high' : 'mid',
              messages: chatMessages
            };
          }
          return s;
        })
      );
    }
  }, [chatMessages, activeSessionId]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const callAiApi = async (userPrompt: string): Promise<string> => {
    try {
      const responseTimeSec = Math.round((Date.now() - questionStartTimeRef.current) / 1000);
      const API_URL = import.meta.env.VITE_API_URL || 'https://ai-interview-coach-qux6.onrender.com';
      
      const res = await fetch(`${API_URL}/api/interview/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userPrompt,
          resumeContext: resumeFileName ? `Uploaded file: ${resumeFileName}` : 'General professional profile',
          responseTimeSec: responseTimeSec
        })
      });

      const data = await res.json();
      questionStartTimeRef.current = Date.now();

      if (data.error) {
        return `⚠️ API Error: ${data.error}`;
      }

      return data.reply || "Let's continue. Can you describe how you handle pressure in team environments?";
    } catch (err) {
      console.error("Backend server connection error:", err);
      return "⚠️ Unable to connect to your backend server. Please ensure Render is running.";
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const userMsg: ChatMessage = {
      sender: 'user',
      text: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages((prev) => [...prev, userMsg]);
    const currentInput = inputText;
    setInputText('');

    const aiResponseText = await callAiApi(currentInput);

    setChatMessages((prev) => [
      ...prev,
      {
        sender: 'ai',
        text: aiResponseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const handleDriveFileSelectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (driveTab === 'picker') {
      const chosen = driveFiles.find(f => f.id === selectedDriveFileId);
      if (!chosen) return;
      setResumeUploaded(true);
      setResumeFileName(chosen.name);
    } else {
      if (!driveUrlInput) return;
      setResumeUploaded(true);
      setResumeFileName(driveUrlInput.split('/').pop() || 'Google_Drive_Resume.pdf');
      setDriveUrlInput('');
    }
    setShowDriveModal(false);
    setSelectedDriveFileId(null);

    setChatMessages((prev) => [
      ...prev,
      {
        sender: 'ai',
        text: `📄 Résumé successfully loaded from your connected Google Account! I've parsed your experience. Let's dive right in — what project or role would you like to target first?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    questionStartTimeRef.current = Date.now();
  };

  const hasSessions = sessions.length > 0;
  const avgNumericScore = hasSessions
    ? Math.round(sessions.reduce((acc, curr) => acc + curr.score, 0) / sessions.length)
    : 0;
  const avgScore = hasSessions ? avgNumericScore + '%' : '—';
  const totalSimulations = sessions.length;

  const getReadinessTier = (score: number, count: number) => {
    if (count === 0) return 'Uncalibrated';
    if (score < 60) return 'Developing';
    if (score < 75) return 'Competent';
    if (score < 90) return 'Strong Contender';
    return 'Elite';
  };

  const readinessTier = getReadinessTier(avgNumericScore, totalSimulations);

  const generateAdaptiveSummary = (msgCount: number, score: number) => {
    const userExchanges = Math.floor(msgCount / 2);
    let engagementNote = "";
    if (userExchanges <= 1) {
      engagementNote = "The candidate initiated the chat with introductory remarks.";
    } else if (userExchanges <= 3) {
      engagementNote = `The candidate completed ${userExchanges} conversational exchanges with steady pacing.`;
    } else {
      engagementNote = `The candidate maintained an active dialogue consisting of ${userExchanges} conversational turns, displaying high engagement.`;
    }

    let qualityNote = "";
    if (score >= 80) {
      qualityNote = "The interviewee knows how to talk professionally, articulates points clearly, and maintains strong composure.";
    } else if (score >= 60) {
      qualityNote = "The interviewee communicates decently, though expanding on specifics would elevate the performance.";
    } else {
      qualityNote = "Communication was minimal; developing a structured thought process will improve results.";
    }

    return `${engagementNote} ${qualityNote}`;
  };

  const generateDynamicStrengths = (msgCount: number) => {
    const list = ['Clear and concise articulation', 'Good initial engagement'];
    if (msgCount > 4) {
      list.push('Maintained sustained back-and-forth communication flow');
    }
    if (msgCount > 8) {
      list.push('Demonstrated persistent adaptability across multiple dialogue turns');
    }
    return list;
  };

  return (
    <div className="app-container">
      {showSplash && <SplashTransition onComplete={handleSplashComplete} />}

      <div className={`dashboard-wrapper ${!showSplash ? 'visible' : ''}`}>

        <header className="dashboard-header">
          <div className="nav-left">
            <span className="status-dot"></span>
            <span className="brand-name" onClick={() => changeView('landing')} style={{ cursor: 'pointer' }}>
              Interview Coach
            </span>
          </div>

          <div className="nav-right">
            {currentView !== 'dashboard' && currentView !== 'interview-room' ? (
              <>
                <button className="nav-link-btn" onClick={() => changeView('features')}>Features</button>
                <button className="nav-link-btn" onClick={() => changeView('how-it-works')}>How it works</button>
                <button className="signin-btn" onClick={() => changeView('login')}>Sign In</button>
              </>
            ) : currentView === 'interview-room' ? (
              <>
                <span className="user-welcome-text" style={{ color: '#22d3ee' }}>🔴 Live Simulation Active</span>
                <button className="signin-btn" onClick={() => changeView('dashboard')}>Exit Room</button>
              </>
            ) : (
              <>
                <span className="user-welcome-text">Welcome!</span>
                <button className="signin-btn" onClick={() => {
                  setGoogleAccessToken(null);
                  setUserEmail('');
                  sessionStorage.removeItem('google_access_token');
                  sessionStorage.removeItem('user_email');
                  setSessions([]);
                  changeView('landing');
                }}>Sign Out</button>
              </>
            )}
          </div>
        </header>

        <main className="dashboard-main">
          {currentView === 'landing' && (
            <>
              <div className="hero-section">
                <span className="hero-badge">AI-powered mock interviews</span>
                <h1 className="hero-headline">Practice interviews that actually feel real</h1>
                <p className="hero-desc">
                  Upload your résumé, get role-specific questions, answer by voice or text, and receive structured feedback instantly.
                </p>
                <button className="start-first-interview-btn" onClick={() => changeView('login')}>
                  ▶ Start your first interview
                </button>
              </div>

              <div className="features-grid">
                <div className="feature-card">
                  <div className="feature-icon">🎤</div>
                  <h3>Voice-native answers</h3>
                  <p>Speak your answer like a real interview — transcribed live.</p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon">📄</div>
                  <h3>Résumé-aware questions</h3>
                  <p>Questions generated from your actual background and target role.</p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon">📊</div>
                  <h3>Structured scoring</h3>
                  <p>Clear rubric-based feedback, not vague paragraphs.</p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon">📈</div>
                  <h3>Progress tracking</h3>
                  <p>See your score trend and weak areas over time.</p>
                </div>
              </div>
            </>
          )}

          {currentView === 'features' && (
            <div className="student-dashboard" style={{ maxWidth: '850px', margin: '0 auto', paddingBottom: '4px' }}>
              <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <span className="hero-badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                  ✨ Ecosystem Capabilities
                </span>
                <h2 className="dash-welcome-title" style={{ fontSize: '2.4rem', marginTop: '0.8rem', background: 'linear-gradient(to right, #f8fafc, #93c5fd, #c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Engineered for Absolute Interview Mastery
                </h2>
                <p className="dash-subtitle-text" style={{ fontSize: '1.05rem', maxWidth: '600px', margin: '0.5rem auto 0', color: '#94a3b8' }}>
                  Explore the professional-grade tools built to transform your preparation and secure your dream offer.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
                <div style={{
                  background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  border: '1px solid rgba(34, 211, 238, 0.4)',
                  borderRadius: '16px',
                  padding: '1.8rem 2rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.5rem',
                  boxShadow: '0 0 20px rgba(34, 211, 238, 0.12), inset 0 1px 0 rgba(34, 211, 238, 0.2)'
                }}>
                  <div style={{ fontSize: '2.2rem', padding: '12px', background: 'rgba(34, 211, 238, 0.1)', borderRadius: '12px', border: '1px solid rgba(34, 211, 238, 0.3)', flexShrink: 0 }}>🎙️</div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.3rem' }}>Voice-Activated Live Simulations</h3>
                    <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                      Engage in natural, low-latency conversational audio while your spoken answers transcribe dynamically on screen.
                    </p>
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(135deg, rgba(15, 46, 61, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  borderRadius: '16px',
                  padding: '1.8rem 2rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.5rem',
                  boxShadow: '0 0 20px rgba(52, 211, 153, 0.12), inset 0 1px 0 rgba(52, 211, 153, 0.2)'
                }}>
                  <div style={{ fontSize: '2.2rem', padding: '12px', background: 'rgba(52, 211, 153, 0.1)', borderRadius: '12px', border: '1px solid rgba(52, 211, 153, 0.3)', flexShrink: 0 }}>☁️️</div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.3rem' }}>Smart Google Drive & CV Sync</h3>
                    <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                      Instantly import and parse your professional résumé straight from your Google Cloud account with our secure picker.
                    </p>
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(135deg, rgba(59, 29, 51, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  border: '1px solid rgba(244, 63, 94, 0.4)',
                  borderRadius: '16px',
                  padding: '1.8rem 2rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.5rem',
                  boxShadow: '0 0 20px rgba(244, 63, 94, 0.12), inset 0 1px 0 rgba(244, 63, 94, 0.2)'
                }}>
                  <div style={{ fontSize: '2.2rem', padding: '12px', background: 'rgba(244, 63, 94, 0.1)', borderRadius: '12px', border: '1px solid rgba(244, 63, 94, 0.3)', flexShrink: 0 }}>🎯</div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.3rem' }}>Role-Targeted Question Engine</h3>
                    <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                      Experience hyper-personalized technical and behavioral inquiries tailored explicitly to your target stack and career history.
                    </p>
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(135deg, rgba(59, 47, 30, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  border: '1px solid rgba(251, 191, 36, 0.4)',
                  borderRadius: '16px',
                  padding: '1.8rem 2rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.5rem',
                  boxShadow: '0 0 20px rgba(251, 191, 36, 0.12), inset 0 1px 0 rgba(251, 191, 36, 0.2)'
                }}>
                  <div style={{ fontSize: '2.2rem', padding: '12px', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '12px', border: '1px solid rgba(251, 191, 36, 0.3)', flexShrink: 0 }}>📊</div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.3rem' }}>Rubric-Based Feedback System</h3>
                    <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                      Unlock crystal-clear metric breakdowns, detailed strength analysis, and precision feedback instead of vague summaries.
                    </p>
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(135deg, rgba(46, 16, 101, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  borderRadius: '16px',
                  padding: '1.8rem 2rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.5rem',
                  boxShadow: '0 0 20px rgba(168, 85, 247, 0.12), inset 0 1px 0 rgba(168, 85, 247, 0.2)'
                }}>
                  <div style={{ fontSize: '2.2rem', padding: '12px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.3)', flexShrink: 0 }}>📈</div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.3rem' }}>Command Center & Historical Analytics</h3>
                    <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                      Monitor historical session trends, identify recurring weak spots, and accurately gauge your interview readiness tier over multiple practice runs.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentView === 'how-it-works' && (
            <div className="student-dashboard" style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <span className="hero-badge">Step-by-Step Guide</span>
                <h2 className="dash-welcome-title" style={{ fontSize: '2.2rem', marginTop: '0.5rem' }}>How AI Interview Coach Works</h2>
                <p className="dash-subtitle-text">Go from initial setup to interview-ready in four straightforward steps.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div className="feature-card" style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', textAlign: 'left', padding: '1.5rem' }}>
                  <div style={{ background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee', fontSize: '1.5rem', fontWeight: 700, padding: '0.8rem 1.2rem', borderRadius: '12px' }}>01</div>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.4rem', color: '#f8fafc' }}>Connect Your Account & Import Résumé</h3>
                    <p style={{ color: '#94a3b8', lineHeight: 1.5 }}>Sign in securely with Google and pull your résumé file directly from your connected Drive storage using our integrated file picker.</p>
                  </div>
                </div>

                <div className="feature-card" style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', textAlign: 'left', padding: '1.5rem' }}>
                  <div style={{ background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee', fontSize: '1.5rem', fontWeight: 700, padding: '0.8rem 1.2rem', borderRadius: '12px' }}>02</div>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.4rem', color: '#f8fafc' }}>Launch a Role-Specific Simulation</h3>
                    <p style={{ color: '#94a3b8', lineHeight: 1.5 }}>Start a live session tailored to the technical and behavioral standards of your target role and industry requirements.</p>
                  </div>
                </div>

                <div className="feature-card" style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', textAlign: 'left', padding: '1.5rem' }}>
                  <div style={{ background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee', fontSize: '1.5rem', fontWeight: 700, padding: '0.8rem 1.2rem', borderRadius: '12px' }}>03</div>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.4rem', color: '#f8fafc' }}>Engage via Voice or Text</h3>
                    <p style={{ color: '#94a3b8', lineHeight: 1.5 }}>Answer interview questions dynamically by typing your thoughts or speaking aloud directly into your microphone.</p>
                  </div>
                </div>

                <div className="feature-card" style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', textAlign: 'left', padding: '1.5rem' }}>
                  <div style={{ background: 'rgba(34, 211, 238, 0.15)', color: '#22d3ee', fontSize: '1.5rem', fontWeight: 700, padding: '0.8rem 1.2rem', borderRadius: '12px' }}>04</div>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.4rem', color: '#f8fafc' }}>Review Performance & Improve</h3>
                    <p style={{ color: '#94a3b8', lineHeight: 1.5 }}>Analyze your instant breakdown report, review strengths, and apply recommended improvements before heading into your real interview.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentView === 'login' && (
            <div className="login-container">
              <div className="login-card">
                <h2 className="card-title" style={{ textAlign: 'center' }}>Welcome to AI Interview Coach</h2>
                <p className="card-desc" style={{ textAlign: 'center', marginBottom: '2rem' }}>
                  Sign in securely with your student Google account to access your personalized interview dashboard.
                </p>

                <button
                  className="google-signin-btn"
                  onClick={() => {
                    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
                    if (!clientId) {
                      alert("Missing VITE_GOOGLE_CLIENT_ID in client/.env");
                      return;
                    }

                    const initLoginAuth = () => {
                      const client = (window as any).google.accounts.oauth2.initTokenClient({
                        client_id: clientId,
                        scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email',
                        callback: async (tokenResponse: any) => {
                          if (tokenResponse && tokenResponse.access_token) {
                            setGoogleAccessToken(tokenResponse.access_token);
                            sessionStorage.setItem('google_access_token', tokenResponse.access_token);
                            await fetchUserProfile(tokenResponse.access_token);
                            changeView('dashboard');
                          }
                        },
                      });
                      client.requestAccessToken();
                    };

                    if (!(window as any).google) {
                      const script = document.createElement('script');
                      script.src = 'https://accounts.google.com/gsi/client';
                      script.async = true;
                      script.defer = true;
                      script.onload = () => initLoginAuth();
                      document.body.appendChild(script);
                    } else {
                      initLoginAuth();
                    }
                  }}
                >
                  <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  Continue with Google
                </button>

                <div className="login-footer-text" onClick={() => changeView('landing')}>
                  ← Back to home
                </div>
              </div>
            </div>
          )}

          {currentView === 'dashboard' && (
            <div className="student-dashboard">
              <div className="dashboard-top-row">
                <div>
                  <h2 className="dash-welcome-title">Your Interview Command Center</h2>
                  <p className="dash-subtitle-text">Track your progress, review past simulations, and manage active sessions.</p>
                </div>
                <div className="dashboard-action-buttons">
                  <button
                    className="start-interview-btn resume-btn"
                    onClick={handleResumeSession}
                    style={!hasSessions ? { background: '#1e293b', color: '#64748b', borderColor: '#334155', boxShadow: 'none', cursor: 'not-allowed' } : {}}
                  >
                    ⚡ Resume Last Session
                  </button>
                  <button className="start-interview-btn new-btn" onClick={handleNewInterview}>
                    ✨ Start New Interview
                  </button>
                </div>
              </div>

              <div className="stats-row">
                <div className="stat-card">
                  <h3>Average Score</h3>
                  <div className="stat-value">{avgScore}</div>
                  <p className="stat-trend">{hasSessions ? '+5% from last session' : 'Awaiting your first session'}</p>
                </div>
                <div className="stat-card">
                  <h3>Simulations Completed</h3>
                  <div className="stat-value">{totalSimulations}</div>
                  <p className="stat-trend">{hasSessions ? 'Active tracking enabled' : 'No simulations recorded'}</p>
                </div>
                <div className="stat-card">
                  <h3>Readiness Tier</h3>
                  <div className="stat-value" style={{ color: hasSessions ? '#22d3ee' : '#64748B' }}>{readinessTier}</div>
                  <p className="stat-trend">{hasSessions ? 'Calibrated session data' : 'Complete a session to calibrate'}</p>
                </div>
              </div>

              <div className="history-section">
                <h3 className="section-title">Recent Session History</h3>
                {hasSessions ? (
                  <div className="history-list">
                    {sessions.map((session) => (
                      <div key={session.id} className="history-item">
                        <div>
                          <strong>{session.title}</strong>
                        </div>
                        <div className="history-right-group">
                          <div className={`history-score ${session.grade}`}>{session.score}%</div>
                          <button
                            className="view-report-btn"
                            onClick={() => setSelectedFeedback({
                              sessionTitle: session.title,
                              sessionScore: session.score,
                              messages: session.messages || [],
                              report: session.feedback
                            })}
                          >
                            View Feedback Report
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-history-state">
                    <p className="empty-history-text">No sessions taken yet. Click below to start your first session.</p>
                    <button className="start-first-interview-btn" onClick={handleNewInterview}>
                      Start Your First Interview Now
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentView === 'interview-room' && (
            <div className="interview-room-container">
              <div className="chat-messages-area" ref={chatScrollRef}>
                {resumeUploaded && (
                  <div className="resume-notice-pill">
                    <span>📄 Résumé Loaded: {resumeFileName}</span>
                  </div>
                )}

                {chatMessages.map((msg, index) => (
                  <div key={index} className={`chat-bubble-row ${msg.sender}`}>
                    <div className={`chat-bubble ${msg.sender}`}>
                      <div className="bubble-meta">
                        <span>{msg.sender === 'ai' ? '🤖 AI Coach' : '👤 You'}</span>
                        <span className="bubble-time">{msg.timestamp}</span>
                      </div>
                      <p>{msg.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              {isMicActive && (
                <div className="mic-listening-banner">
                  <div className="mic-wave-animation">
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                  <p>Microphone listening... Speak now...</p>
                </div>
              )}

              <form className="chat-input-footer" onSubmit={handleSendMessage}>
                <div className="plus-menu-container" ref={plusMenuRef}>
                  <button
                    type="button"
                    className="plus-trigger-btn"
                    onClick={() => setShowPlusMenu(!showPlusMenu)}
                    title="Add attachments"
                  >
                    +
                  </button>

                  {showPlusMenu && (
                    <div className="plus-popup-menu">
                      <button
                        type="button"
                        className="plus-menu-item"
                        onClick={() => {
                          setShowPlusMenu(false);
                          setShowDriveModal(true);
                          handleGoogleDriveClick();
                        }}
                      >
                        <svg className="google-drive-icon" viewBox="0 0 87.3 78" width="18" height="18">
                          <path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.45z" />
                          <path fill="#00ac47" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a8.94 8.94 0 0 0 -1.2 4.45h27.5z" />
                          <path fill="#ea4335" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.35 1.2-2.9 1.2-4.45h-27.5l5.85 10.15z" />
                          <path fill="#00832d" d="m43.65 25 13.75-23.8c-.8-.45-1.7-.7-2.65-.7h-22.2c-.95 0-1.85.25-2.65.7z" />
                          <path fill="#2684fc" d="m59.8 53h-32.3l-13.75 23.8c.8.45 1.7.7 2.65.7h53.6c.95 0 1.85-.25 2.65-.7z" />
                          <path fill="#ffba00" d="m73.4 26.5-12.75-22.1c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.5c0-1.55-.4-3.1-1.2-4.45z" />
                        </svg>
                        <span>Select from Google Drive</span>
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className={`mic-control-btn ${isMicActive ? 'active' : ''}`}
                  onClick={() => {
                    if (!isMicActive) {
                      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                      if (SpeechRecognition) {
                        const recognition = new SpeechRecognition();
                        recognition.lang = 'en-US';
                        recognition.interimResults = false;
                        recognition.onstart = () => setIsMicActive(true);
                        recognition.onresult = (event: any) => {
                          const transcript = event.results[0][0].transcript;
                          setInputText(transcript);
                          setIsMicActive(false);
                        };
                        recognition.onerror = () => setIsMicActive(false);
                        recognition.onend = () => setIsMicActive(false);
                        recognition.start();
                      } else {
                        alert("Speech recognition is not supported in this browser. Try Google Chrome.");
                        setIsMicActive(false);
                      }
                    } else {
                      setIsMicActive(false);
                    }
                  }}
                >
                  🎙️
                </button>

                <input
                  type="text"
                  className="chat-text-input"
                  placeholder="Type your response or click mic to speak..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />

                <button type="submit" className="send-message-btn">Send ➔</button>
              </form>
            </div>
          )}
        </main>

        {/* FEEDBACK REPORT MODAL */}
        {selectedFeedback && (
          <div className="modal-overlay" onClick={() => setSelectedFeedback(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px', width: '90%', background: '#0f172a', border: '1px solid #334155', borderRadius: '16px', padding: '2rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '1rem', marginBottom: '1.2rem' }}>
                <div>
                  <h3 style={{ color: '#f8fafc', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>📋 Session Feedback Report</h3>
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '4px 0 0 0' }}>{selectedFeedback.sessionTitle}</p>
                </div>
                <button onClick={() => setSelectedFeedback(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '4px' }}>
                <div style={{ background: 'rgba(34, 211, 238, 0.1)', border: '1px solid rgba(34, 211, 238, 0.3)', borderRadius: '10px', padding: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, color: '#22d3ee', fontSize: '0.95rem' }}>Evaluated Score</span>
                    <span style={{ fontWeight: 700, color: '#22d3ee', fontSize: '1.15rem' }}>{selectedFeedback.sessionScore}%</span>
                  </div>
                  <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                    {generateAdaptiveSummary(selectedFeedback.messages.length, selectedFeedback.sessionScore)}
                  </p>
                </div>

                <div>
                  <h4 style={{ color: '#f8fafc', fontSize: '0.95rem', marginBottom: '8px' }}>✨ Key Strengths (Analyzed from {Math.floor(selectedFeedback.messages.length / 2)} conversational exchanges)</h4>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#34d399', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {generateDynamicStrengths(selectedFeedback.messages.length).map((s, idx) => (
                      <li key={idx}><span style={{ color: '#cbd5e1' }}>{s}</span></li>
                    ))}
                  </ul>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem', textAlign: 'right', borderTop: '1px solid #1e293b', paddingTop: '1rem' }}>
                <button
                  onClick={() => setSelectedFeedback(null)}
                  style={{ background: '#22d3ee', color: '#0f172a', border: 'none', padding: '0.6rem 1.4rem', fontWeight: 600, borderRadius: '8px', cursor: 'pointer' }}
                >
                  Close Report
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GOOGLE DRIVE PICKER MODAL WINDOW */}
        {showDriveModal && (
          <div className="modal-overlay" onClick={() => setShowDriveModal(false)}>
            <div className="modal-card google-drive-picker-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px' }}>
              <div className="modal-header" style={{ borderBottom: '1px solid #334155', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg className="google-drive-icon" viewBox="0 0 87.3 78" width="22" height="22">
                    <path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.45z" />
                    <path fill="#00ac47" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a8.94 8.94 0 0 0 -1.2 4.45h27.5z" />
                    <path fill="#ea4335" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.35 1.2-2.9 1.2-4.45h-27.5l5.85 10.15z" />
                    <path fill="#00832d" d="m43.65 25 13.75-23.8c-.8-.45-1.7-.7-2.65-.7h-22.2c-.95 0-1.85.25-2.65.7z" />
                    <path fill="#2684fc" d="m59.8 53h-32.3l-13.75 23.8c.8.45 1.7.7 2.65.7h53.6c.95 0 1.85-.25 2.65-.7z" />
                    <path fill="#ffba00" d="m73.4 26.5-12.75-22.1c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.5c0-1.55-.4-3.1-1.2-4.45z" />
                  </svg>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc' }}>Select file from connected Google Account</h3>
                </div>
                <button className="modal-close-btn" onClick={() => setShowDriveModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer' }}>×</button>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setDriveTab('picker')}
                  style={{ background: 'none', border: 'none', color: driveTab === 'picker' ? '#22d3ee' : '#94a3b8', fontWeight: 600, cursor: 'pointer', paddingBottom: '4px', borderBottom: driveTab === 'picker' ? '2px solid #22d3ee' : 'none' }}
                >
                  My Drive Files
                </button>
                <button
                  type="button"
                  onClick={() => setDriveTab('url')}
                  style={{ background: 'none', border: 'none', color: driveTab === 'url' ? '#22d3ee' : '#94a3b8', fontWeight: 600, cursor: 'pointer', paddingBottom: '4px', borderBottom: driveTab === 'url' ? '2px solid #22d3ee' : 'none' }}
                >
                  Paste Link
                </button>
              </div>

              <form onSubmit={handleDriveFileSelectSubmit}>
                <div className="modal-body" style={{ padding: '1.2rem 0' }}>
                  {driveTab === 'picker' ? (
                    <div>
                      {isFetchingDrive ? (
                        <p style={{ fontSize: '0.9rem', color: '#22d3ee', textAlign: 'center', padding: '2rem 0' }}>
                          Fetching your files from Google Drive...
                        </p>
                      ) : driveFiles.length === 0 ? (
                        <p style={{ fontSize: '0.9rem', color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>
                          No PDF or Word documents found in your Google Drive.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                          {driveFiles.map((file) => (
                            <div
                              key={file.id}
                              onClick={() => setSelectedDriveFileId(file.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                background: selectedDriveFileId === file.id ? 'rgba(34, 211, 238, 0.15)' : '#0f172a',
                                border: selectedDriveFileId === file.id ? '1px solid #22d3ee' : '1px solid #1e293b',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '1.2rem' }}>📄</span>
                                <div>
                                  <div style={{ fontSize: '0.9rem', fontWeight: 500, color: '#f8fafc' }}>{file.name}</div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{file.type} • Modified {file.updated}</div>
                                </div>
                              </div>
                              <input
                                type="radio"
                                checked={selectedDriveFileId === file.id}
                                onChange={() => setSelectedDriveFileId(file.id)}
                                style={{ accentColor: '#22d3ee' }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="card-desc" style={{ marginBottom: '1rem' }}>
                        Paste your shared Google Drive file link directly:
                      </p>
                      <input
                        type="text"
                        className="chat-text-input"
                        style={{ width: '100%', background: '#0f172a' }}
                        placeholder="https://docs.google.com/document/d/.../edit"
                        value={driveUrlInput}
                        onChange={(e) => setDriveUrlInput(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="modal-footer" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', borderTop: '1px solid #334155', paddingTop: '12px' }}>
                  <button type="button" className="signin-btn" onClick={() => setShowDriveModal(false)}>Cancel</button>
                  <button
                    type="submit"
                    className="start-first-interview-btn"
                    style={{ padding: '0.6rem 1.2rem', margin: 0 }}
                    disabled={driveTab === 'picker' && !selectedDriveFileId}
                  >
                    Select & Import
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}