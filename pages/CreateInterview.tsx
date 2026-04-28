import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { SKILL_OPTIONS } from './Profile';
import * as pdfjsLib from 'pdfjs-dist';

import { sendInterviewInvitations } from '../services/brevoService';

// Setup PDF.js worker to enable PDF parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const CreateInterview: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [candidateEmails, setCandidateEmails] = useState<string[]>([]);
  const [currentEmail, setCurrentEmail] = useState('');
  const [parsingJd, setParsingJd] = useState(false);
  const [parsingResumes, setParsingResumes] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [manualQuestions, setManualQuestions] = useState<string[]>([]);
  const [currentManualQuestion, setCurrentManualQuestion] = useState('');
  interface CustomField { id: number; key: string; value: string; }
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [tempCustomField, setTempCustomField] = useState({ key: '', value: '' });

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    department: '',
    employmentType: '',
    experience: 0,
    skills: '',
    education: '',
    deadline: '',
    numQuestions: 5,
    difficulty: 'Medium',
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.create-interview-header', {
        y: -30,
        opacity: 0,
        duration: 0.8,
        ease: 'power3.out'
      });

      gsap.from('.create-interview-form', {
        y: 30,
        opacity: 0,
        duration: 0.8,
        delay: 0.2,
        ease: 'power3.out'
      });

      gsap.from('.form-field', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        delay: 0.4,
        ease: 'power2.out'
      });
    });

    return () => ctx.revert();
  }, []);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ['experience', 'numQuestions'].includes(name) ? Number(value) : value
    }));
  };

  const toggleSkill = (skill: string) => {
    const currentSkills = formData.skills
      ? formData.skills.split(',').map(s => s.trim()).filter(s => s)
      : [];

    let newSkills;
    if (currentSkills.includes(skill)) {
      newSkills = currentSkills.filter(s => s !== skill);
    } else {
      newSkills = [...currentSkills, skill];
    }
    setFormData({ ...formData, skills: newSkills.join(', ') });
  };

  const handleAddManualQuestion = () => {
    if (currentManualQuestion.trim()) {
      setManualQuestions([...manualQuestions, currentManualQuestion.trim()]);
      setCurrentManualQuestion('');
    }
  };

  const handleRemoveManualQuestion = (index: number) => {
    setManualQuestions(manualQuestions.filter((_, i) => i !== index));
  };

  const handleAddCustomField = () => {
    if (tempCustomField.key.trim() && tempCustomField.value.trim()) {
      setCustomFields([...customFields, { ...tempCustomField, id: Date.now() }]);
      setTempCustomField({ key: '', value: '' });
    }
  };

  const handleRemoveCustomField = (id: number) => {
    setCustomFields(customFields.filter(field => field.id !== id));
  };

  const handleAddEmail = () => {
    if (currentEmail && !candidateEmails.includes(currentEmail)) {
      setCandidateEmails([...candidateEmails, currentEmail]);
      setCurrentEmail('');
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setCandidateEmails(candidateEmails.filter(email => email !== emailToRemove));
  };

  const handleJDUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingJd(true);
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
        alert('Unsupported file type. Please upload a PDF or TXT file.');
        setParsingJd(false);
        return;
      }

      if (!text.trim()) {
        alert('Could not extract text from the document.');
        setParsingJd(false);
        return;
      }

      const xaiKey = import.meta.env.VITE_XAI_API_KEY;
      if (!xaiKey) throw new Error('XAI API key missing');
      const prompt = `You are an expert HR assistant. Parse the following job description text and extract the fields into a raw JSON object. Schema: {"title": "string", "description": "string", "department": "string", "employmentType": "string", "experience": "number", "skills": "string", "education": "string"}. Return ONLY valid JSON. Text: --- ${text} ---`;

      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${xaiKey}` },
        body: JSON.stringify({
          model: 'grok-4-1-fast-non-reasoning',
          messages: [
            { role: 'system', content: 'You are an expert HR assistant. Return only valid JSON.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      });
      const aiData = await res.json();
      const aiResponseText = aiData.choices?.[0]?.message?.content || '';
      if (!aiResponseText) throw new Error('Grok did not return a response.');
      const parsedData = JSON.parse(aiResponseText);

      setFormData(prev => ({
        ...prev,
        title: parsedData.title || prev.title,
        description: parsedData.description || prev.description,
        department: parsedData.department || prev.department,
        employmentType: parsedData.employmentType || prev.employmentType,
        experience: parsedData.experience || prev.experience,
        skills: parsedData.skills || prev.skills,
        education: parsedData.education || prev.education,
      }));
      alert('✅ Job description parsed and form autofilled!');
    } catch (error) {
      console.error('Error parsing JD:', error);
      alert('❌ Failed to parse job description. Please fill the form manually.');
    } finally {
      setParsingJd(false);
      e.target.value = '';
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setParsingResumes(true);
    const newEmailsFound: string[] = [];
    let filesProcessed = 0;
    let filesWithErrors = 0;

    for (const file of Array.from(files) as File[]) {
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
          continue; // Skip unsupported file types
        }

        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
        const foundEmails = text.match(emailRegex);

        if (foundEmails) {
          foundEmails.forEach(email => {
            const lowerEmail = email.toLowerCase();
            if (!candidateEmails.includes(lowerEmail) && !newEmailsFound.includes(lowerEmail)) {
              newEmailsFound.push(lowerEmail);
            }
          });
        }
        filesProcessed++;
      } catch (error) {
        console.error(`Error parsing ${file.name}:`, error);
        filesWithErrors++;
      }
    }

    if (newEmailsFound.length > 0) setCandidateEmails(prev => [...prev, ...newEmailsFound]);
    alert(`Processed ${filesProcessed} file(s). Found ${newEmailsFound.length} new email(s). ${filesWithErrors > 0 ? `Failed to parse ${filesWithErrors} file(s).` : ''}`);
    setParsingResumes(false);
    e.target.value = ''; // Reset file input to allow re-uploading the same file
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    try {
      // 1. Generate Interview ID, Link, and Access Code locally
      const newRand = Math.random().toString(36).substring(2, 15);
      const newInterviewLink = `${window.location.origin}/#/interview/${newRand}`;
      const newAccessCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      // 2. Save to Firestore
      await setDoc(doc(db, 'interviews', newRand), {
        ...formData,
        manualQuestions,
        customFields,
        candidateEmails,
        interviewLink: newInterviewLink,
        accessCode: newAccessCode,
        recruiterUID: user.uid,
        createdAt: serverTimestamp(),
        isMock: false,
      });

      // 3. Send invitation emails if candidates are present
      if (candidateEmails.length > 0) {
        setSendingEmails(true);
        try {
          const result = await sendInterviewInvitations(
            candidateEmails,
            formData.title,
            newInterviewLink,
            newAccessCode
          );

          if (result.success) {
            console.log(`[Brevo] Successfully sent ${result.totalEmails} invitation email(s)!`);
          } else {
            console.warn(`[Brevo] Partial failure sending emails: ${result.error}`);
            alert(`⚠️ Interview created, but failed to send some emails: ${result.error}`);
          }
        } catch (err: any) {
          console.error('[Brevo] Email sending error:', err);
          alert(`⚠️ Interview created, but error sending emails: ${err.message}`);
        } finally {
          setSendingEmails(false);
        }
      }

      alert(candidateEmails.length > 0 
        ? "✅ Interview created and invitations sent successfully!" 
        : "✅ Interview created successfully!");
      
      navigate('/recruiter/interviews');
    } catch (err) {
      console.error(err);
      alert("❌ Failed to create interview");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center mb-8 create-interview-header">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Create a New Interview</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Schedule an interview and send invitations to candidates.</p>
      </div>

      <div className="bg-white dark:bg-[#111] rounded-2xl border border-gray-200 dark:border-white/5 p-8 shadow-xl dark:shadow-none create-interview-form">
        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border border-indigo-200 dark:border-indigo-800/50 mb-6 form-field">
            <h4 className="font-bold text-indigo-800 dark:text-indigo-300 mb-2 flex items-center gap-2">
                <i className="fas fa-magic"></i> AI Autofill
            </h4>
            <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-4">
                Save time by uploading a Job Description (PDF/TXT). The AI will automatically fill out the form for you.
            </p>
            <label htmlFor="jd-upload" className={`w-full flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-xl cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-900/30 transition-colors ${parsingJd ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {parsingJd ? (
                    <>
                        <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                        Parsing JD...
                    </>
                ) : (
                    <>
                        <i className="fa-solid fa-file-upload"></i>
                        Upload Job Description
                    </>
                )}
            </label>
            <input id="jd-upload" type="file" accept=".pdf,.txt" className="hidden" onChange={handleJDUpload} disabled={parsingJd} />
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2 form-field">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Job Title / Role</label>
            <input name="title"
              type="text" required 
              className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
              value={formData.title}
              onChange={handleFormChange}
              placeholder="e.g. Senior Frontend Engineer"
            />
          </div>

          <div className="space-y-2 form-field">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Job Description</label>
            <textarea name="description"
              required rows={5} 
              className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
              value={formData.description}
              onChange={handleFormChange}
              placeholder="Describe the role, responsibilities, and what you'''re looking for..."
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 form-field">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Company Department</label>
              <input name="department"
                type="text" required 
                className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                value={formData.department}
                onChange={handleFormChange}
                placeholder="e.g. Engineering, Marketing, Sales"
              />
            </div>
            <div className="space-y-2 form-field">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Employment Type</label>
              <select name="employmentType"
                required 
                className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                value={formData.employmentType}
                onChange={handleFormChange}
              >
                <option value="">Select...</option>
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 form-field">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Required Experience (Years)</label>
              <input name="experience"
                type="number" required 
                className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                value={formData.experience}
                onChange={handleFormChange}
                placeholder="e.g. 3"
              />
            </div>
            <div className="space-y-2 form-field">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Minimum Education Level</label>
              <select name="education"
                required 
                className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                value={formData.education}
                onChange={handleFormChange}
              >
                <option value="">Select...</option>
                <option value="High School">High School</option>
                <option value="Bachelor'''s">Bachelor's</option>
                <option value="Master'''s">Master's</option>
                <option value="PhD">PhD</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 form-field">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Required Skills</label>
            <div className="flex flex-wrap gap-2 mb-2 min-h-[44px] p-2 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl">
              {formData.skills ? formData.skills.split(',').map(s => s.trim()).filter(s => s).map(skill => (
                <span key={skill} className="px-3 py-1 bg-primary/20 text-primary-dark dark:text-primary-light border border-primary/20 rounded-lg text-sm flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                  {skill}
                  <button type="button" onClick={() => toggleSkill(skill)} className="hover:text-black dark:hover:text-white transition-colors">&times;</button>
                </span>
              )) : <span className="text-gray-400 dark:text-gray-500 text-sm p-1.5 italic">No skills selected</span>}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                placeholder="Search or add custom skill..."
                value={skillSearch}
                onChange={e => setSkillSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (skillSearch.trim()) {
                      toggleSkill(skillSearch.trim());
                      setSkillSearch('');
                    }
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (skillSearch.trim()) {
                    toggleSkill(skillSearch.trim());
                    setSkillSearch('');
                  }
                }}
                className="px-6 py-3 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium"
              >
                Add
              </button>
            </div>

            <div className="mt-2 border border-gray-200 dark:border-white/10 rounded-xl p-3 max-h-40 overflow-y-auto bg-gray-50 dark:bg-[#1a1a1a] custom-scrollbar">
              <div className="flex flex-wrap gap-2">
                {SKILL_OPTIONS.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase())).map(skill => {
                  const isSelected = formData.skills.split(',').map(s => s.trim()).includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${isSelected
                        ? 'bg-primary/20 border-primary/50 text-gray-900 dark:text-white font-medium'
                        : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                      {skill} {isSelected && '✓'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4 form-field p-6 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/20 rounded-2xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <i className="fa-solid fa-robot text-blue-500"></i>
                  Number of AI-Generated Questions
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Specify how many questions the AI should create based on the job description.</p>
              </div>
              
              <div className="flex items-center gap-3 bg-white dark:bg-[#1a1a1a] p-1.5 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm self-start md:self-center">
                <button
                  type="button"
                  disabled={formData.numQuestions <= 1}
                  onClick={() => setFormData(prev => ({ ...prev, numQuestions: Math.max(1, prev.numQuestions - 1) }))}
                  className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-blue-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-gray-100 dark:border-white/5"
                >
                  <i className="fa-solid fa-minus text-xs"></i>
                </button>
                <input name="numQuestions"
                  type="number" min="1" max="25" 
                  className="w-12 text-center bg-transparent border-none text-lg font-bold text-gray-900 dark:text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={formData.numQuestions}
                  onChange={handleFormChange}
                />
                
                <button
                  type="button"
                  disabled={formData.numQuestions >= 25}
                  onClick={() => setFormData(prev => ({ ...prev, numQuestions: Math.min(25, prev.numQuestions + 1) }))}
                  className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-blue-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-gray-100 dark:border-white/5"
                >
                  <i className="fa-solid fa-plus text-xs"></i>
                </button>
              </div>
            </div>
          </div>
          
          <div className="space-y-2 form-field">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Difficulty Level</label>
            <select 
              name="difficulty" 
              value={formData.difficulty} 
              onChange={handleFormChange} 
              className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white appearance-none focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
            >
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </div>

          <div className="space-y-4 form-field p-6 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/20 rounded-2xl">
            <div>
              <label className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fa-solid fa-clipboard-question text-blue-500"></i>
                Manual Interview Questions (Optional)
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add specific questions you want the AI to ask during the interview.</p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 px-4 py-3 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
                placeholder="e.g. Tell us about your experience with React..."
                value={currentManualQuestion}
                onChange={e => setCurrentManualQuestion(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddManualQuestion();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddManualQuestion}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all font-medium flex items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                <i className="fa-solid fa-plus text-xs"></i>
                Add
              </button>
            </div>

            {manualQuestions.length > 0 && (
              <div className="space-y-2 mt-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {manualQuestions.map((q, index) => (
                  <div key={index} className="flex items-start justify-between p-3.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{q}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveManualQuestion(index)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    >
                      <i className="fa-solid fa-trash-can text-sm"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 form-field p-6 bg-gray-50/50 dark:bg-gray-800/20 border border-gray-100 dark:border-white/10 rounded-2xl">
              <div>
                  <label className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <i className="fa-solid fa-plus-circle text-gray-500"></i>
                      Custom Fields (Optional)
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add any other relevant information for the job.</p>
              </div>

              <div className="flex gap-2">
                  <input
                      type="text"
                      className="flex-1 px-4 py-3 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-sm"
                      placeholder="Field Name (e.g., Salary Range)"
                      value={tempCustomField.key}
                      onChange={e => setTempCustomField({ ...tempCustomField, key: e.target.value })}
                  />
                  <input
                      type="text"
                      className="flex-1 px-4 py-3 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-sm"
                      placeholder="Field Value (e.g., $80k - $120k)"
                      value={tempCustomField.value}
                      onChange={e => setTempCustomField({ ...tempCustomField, value: e.target.value })}
                  />
                  <button type="button" onClick={handleAddCustomField} className="px-6 py-3 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium text-sm">Add</button>
              </div>

              {customFields.length > 0 && (
                  <div className="space-y-2 mt-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {customFields.map((field) => (
                          <div key={field.id} className="flex items-center justify-between p-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl animate-in fade-in">
                              <div className="flex gap-2 text-sm">
                                  <strong className="text-gray-800 dark:text-gray-200">{field.key}:</strong>
                                  <span className="text-gray-600 dark:text-gray-400">{field.value}</span>
                              </div>
                              <button type="button" onClick={() => handleRemoveCustomField(field.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                                  <i className="fa-solid fa-trash-can text-xs"></i>
                              </button>
                          </div>
                      ))}
                  </div>
              )}
          </div>

          <div className="space-y-2 form-field">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Application Deadline</label>
            <input name="deadline"
              type="date" 
              className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all dark:[color-scheme:dark]"
              value={formData.deadline}
              onChange={handleFormChange}
            />
          </div>
          
          <div className="space-y-2 form-field">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Candidate Emails</label>
            <div className="flex items-center gap-2">
                <input
                    type="email"
                    value={currentEmail}
                    onChange={(e) => setCurrentEmail(e.target.value)}
                    placeholder="Enter candidate email and press Enter or click Add"
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                />
                <button type="button" onClick={handleAddEmail} className="px-6 py-3 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium">Add</button>
            </div>
             <div className="flex flex-wrap gap-2 mt-2">
                {candidateEmails.map(email => (
                    <div key={email} className="flex items-center gap-2 bg-gray-200 dark:bg-gray-700 rounded-full px-3 py-1 text-sm">
                        {email}
                        <button type="button" onClick={() => handleRemoveEmail(email)} className="text-red-500 hover:text-red-700">
                            &times;
                        </button>
                    </div>
                ))}
            </div>

            <div className="relative flex py-2 items-center form-field">
                <div className="flex-grow border-t border-gray-200 dark:border-white/10"></div>
                <span className="flex-shrink mx-4 text-gray-400 dark:text-gray-500 text-xs">OR</span>
                <div className="flex-grow border-t border-gray-200 dark:border-white/10"></div>
            </div>

            <div className="form-field">
                <label htmlFor="resume-upload" className={`w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white border border-gray-200 dark:border-white/10 rounded-xl hover:bg-gray-200 dark:hover:bg-white/10 transition-colors font-medium cursor-pointer ${parsingResumes ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {parsingResumes ? (
                        <>
                            <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                            Parsing Resumes...
                        </>
                    ) : (
                        <>
                            <i className="fa-solid fa-file-upload"></i>
                            Upload Resumes to Find Emails
                        </>
                    )}
                </label>
                <input id="resume-upload" type="file" multiple accept=".pdf,.txt" className="hidden" onChange={handleResumeUpload} disabled={parsingResumes} />
                <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-2">Upload one or more PDF/TXT resumes to automatically extract emails.</p>
            </div>

          </div>

          <div className="pt-4 form-field">
            <button
              type="submit"
              disabled={loading || sendingEmails}
              className="w-full bg-primary hover:bg-primary-dark text-white dark:text-black font-bold py-4 px-4 rounded-xl shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {loading || sendingEmails ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  {loading ? 'Saving Interview...' : `Sending Invitations...`}
                </>
              ) : (
                <>
                  <i className="fa-solid fa-paper-plane text-sm"></i>
                  Create Interview & Send Invitations
                </>
              )}
            </button>
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-3 italic">
              This will generate access codes and notify listed candidates automatically.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateInterview;