import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, serverTimestamp, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { SKILL_OPTIONS } from './Profile';
import * as pdfjsLib from 'pdfjs-dist';

import { sendInterviewInvitations } from '../services/brevoService';
import { sendBulkWhatsAppInvitations, extractPhoneFromText } from '../services/wasenderService';
import { addDoc } from 'firebase/firestore';

// Setup PDF.js worker to enable PDF parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const CreateInterview: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [candidateEmails, setCandidateEmails] = useState<string[]>([]);
  const [candidatePhones, setCandidatePhones] = useState<Record<string, string>>({});
  const [currentEmail, setCurrentEmail] = useState('');
  const [currentPhone, setCurrentPhone] = useState('');
  const [editingCandidateEmailKey, setEditingCandidateEmailKey] = useState<string | null>(null);
  const [editedEmailInput, setEditedEmailInput] = useState('');
  const [editedPhoneInput, setEditedPhoneInput] = useState('');
  const [parsingJd, setParsingJd] = useState(false);
  const [parsingResumes, setParsingResumes] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [manualQuestions, setManualQuestions] = useState<string[]>([]);
  const [currentManualQuestion, setCurrentManualQuestion] = useState('');
  interface CustomField { id: number; key: string; value: string; }
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [tempCustomField, setTempCustomField] = useState({ key: '', value: '' });

  const [eduInput, setEduInput] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    department: '',
    employmentType: '',
    minExperience: 0,
    maxExperience: 0,
    experience: 0,
    skills: '',
    education: '',
    deadline: '',
    numQuestions: 5,
    difficulty: 'Medium',
    strictness: 'Medium',
    maxResponses: '',
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
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: ['experience', 'minExperience', 'maxExperience', 'numQuestions'].includes(name) ? Number(value) : (name === 'maxResponses' ? (value === '' ? '' : Number(value)) : value)
      };
      if (name === 'minExperience') {
        updated.experience = Number(value);
      }
      return updated;
    });
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

  const toggleEducation = (edu: string) => {
    const currentEducations = formData.education
      ? formData.education.split(',').map(e => e.trim()).filter(e => e)
      : [];

    let newEducations;
    if (currentEducations.includes(edu)) {
      newEducations = currentEducations.filter(e => e !== edu);
    } else {
      newEducations = [...currentEducations, edu];
    }
    setFormData({ ...formData, education: newEducations.join(', ') });
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
    if (currentEmail && !candidateEmails.includes(currentEmail.trim().toLowerCase())) {
      const lower = currentEmail.trim().toLowerCase();
      setCandidateEmails(prev => [...prev, lower]);
      if (currentPhone.trim()) {
        setCandidatePhones(prev => ({ ...prev, [lower]: currentPhone.trim() }));
      }
      setCurrentEmail('');
      setCurrentPhone('');
    }
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setCandidateEmails(prev => prev.filter(e => e.toLowerCase() !== emailToRemove.toLowerCase()));
    setCandidatePhones(prev => {
      const copy = { ...prev };
      delete copy[emailToRemove.toLowerCase()];
      return copy;
    });
  };

  const handleSaveCandidateEdit = (oldEmail: string) => {
    const trimmedEmail = editedEmailInput.trim().toLowerCase();
    const trimmedPhone = editedPhoneInput.trim();
    if (!trimmedEmail) return;

    setCandidateEmails(prev => prev.map(e => e.toLowerCase() === oldEmail.toLowerCase() ? trimmedEmail : e));
    setCandidatePhones(prev => {
      const copy = { ...prev };
      delete copy[oldEmail.toLowerCase()];
      if (trimmedPhone) copy[trimmedEmail] = trimmedPhone;
      return copy;
    });
    setEditingCandidateEmailKey(null);
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
        const extractedPhone = extractPhoneFromText(text);

        if (foundEmails) {
          for (const email of foundEmails) {
            const lowerEmail = email.toLowerCase();
            if (!candidateEmails.includes(lowerEmail) && !newEmailsFound.includes(lowerEmail)) {
              newEmailsFound.push(lowerEmail);

              if (extractedPhone && extractedPhone !== 'N/A') {
                setCandidatePhones(prev => ({ ...prev, [lowerEmail]: extractedPhone }));
              }

              // Auto save/sync candidate contact to database
              if (user && extractedPhone && extractedPhone !== 'N/A') {
                try {
                  const qExist = query(
                    collection(db, 'candidateResumes'),
                    where('recruiterUID', '==', user.uid),
                    where('email', '==', lowerEmail)
                  );
                  const existSnap = await getDocs(qExist);
                  if (existSnap.empty) {
                    const derivedName = lowerEmail.split('@')[0].replace(/[._-]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                    await addDoc(collection(db, 'candidateResumes'), {
                      recruiterUID: user.uid,
                      name: derivedName,
                      email: lowerEmail,
                      phone: extractedPhone,
                      skills: [],
                      experienceYears: 0,
                      summary: 'Auto-parsed candidate profile from resume upload.',
                      fileName: file.name,
                      createdAt: serverTimestamp(),
                    });
                  }
                } catch (dbErr) {
                  console.error('Error auto-syncing candidate resume contact:', dbErr);
                }
              }
            }
          }
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

    if (formData.maxExperience < formData.minExperience) {
      alert("❌ Maximum experience cannot be less than minimum experience.");
      return;
    }

    setLoading(true);

    try {
      // Check recruiter active interview limit
      const recruiterDocSnap = await getDoc(doc(db, 'users', user.uid));
      let limit = 5; // default limit if not explicitly set
      if (recruiterDocSnap.exists()) {
        const uData = recruiterDocSnap.data();
        if (uData.interviewLimit !== undefined) {
          limit = Number(uData.interviewLimit);
        }
      }

      // Count existing recruiter interviews
      const interviewsQuery = query(
        collection(db, 'interviews'),
        where('recruiterUID', '==', user.uid)
      );
      const interviewsSnap = await getDocs(interviewsQuery);
      const existingInterviews = interviewsSnap.docs.filter(doc => (doc.data() as any).isMock !== true);

      if (existingInterviews.length >= limit) {
        alert(`❌ Limit Reached: You have created ${existingInterviews.length} out of ${limit} allowed interviews. Please contact the administrator to increase your account limit.`);
        setLoading(false);
        return;
      }

      // 1. Generate Interview ID, Link, and Access Code locally
      const newRand = Math.random().toString(36).substring(2, 15);
      const newInterviewLink = `${window.location.origin}/#/interview/${newRand}`;
      const newAccessCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      // 2. Save to Firestore
      const candidateData = candidateEmails.map(email => ({
        email: email.toLowerCase(),
        phone: candidatePhones[email.toLowerCase()] || 'N/A'
      }));

      await setDoc(doc(db, 'interviews', newRand), {
        ...formData,
        manualQuestions,
        customFields,
        candidateEmails,
        candidateData,
        interviewLink: newInterviewLink,
        accessCode: newAccessCode,
        recruiterUID: user.uid,
        createdAt: serverTimestamp(),
        isMock: false,
      });

      // 3. Send invitation emails and WhatsApp messages if candidates are present
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
          }

          // Fetch stored candidate phone numbers
          try {
            const phoneCandidates: Array<{ phone: string; name?: string; email?: string }> = candidateEmails
              .map(email => ({
                email: email.toLowerCase(),
                phone: candidatePhones[email.toLowerCase()] || 'N/A'
              }))
              .filter(c => c.phone && c.phone !== 'N/A');

            if (phoneCandidates.length > 0) {
              const waRes = await sendBulkWhatsAppInvitations(
                phoneCandidates,
                formData.title,
                newInterviewLink,
                newAccessCode
              );
              console.log(`[WasenderAPI] WhatsApp invites sent: ${waRes.successCount}`);
            }
          } catch (waErr) {
            console.error('[WasenderAPI] WhatsApp dispatch error:', waErr);
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
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Create a New Interview</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">Configure candidate evaluation requirements, parameters, and access permissions.</p>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-8 shadow-sm create-interview-form">
        {/* AI Autofill Banner */}
        <div className="p-5 bg-gray-50/80 dark:bg-zinc-950/60 rounded-xl border border-gray-200 dark:border-zinc-800 mb-6 form-field">
            <h4 className="font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2 text-sm">
                <i className="fas fa-sparkles text-primary"></i> AI Job Description Autofill
            </h4>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-4">
                Upload a Job Description (PDF/TXT). The AI will parse details and automatically fill out the form for you.
            </p>
            <label htmlFor="jd-upload" className={`w-full flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-zinc-900 text-gray-800 dark:text-gray-200 border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-xs font-bold shadow-xs ${parsingJd ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {parsingJd ? (
                    <>
                        <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                        Parsing Document...
                    </>
                ) : (
                    <>
                        <i className="fa-solid fa-file-upload text-xs text-primary"></i>
                        Upload Job Description (PDF / TXT)
                    </>
                )}
            </label>
            <input id="jd-upload" type="file" accept=".pdf,.txt" className="hidden" onChange={handleJDUpload} disabled={parsingJd} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5 form-field">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Job Title / Role</label>
            <input name="title"
              type="text" required 
              className="w-full px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
              value={formData.title}
              onChange={handleFormChange}
              placeholder="e.g. Senior Frontend Engineer"
            />
          </div>

          <div className="space-y-1.5 form-field">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Job Description</label>
            <textarea name="description"
              required rows={5} 
              className="w-full px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
              value={formData.description}
              onChange={handleFormChange}
              placeholder="Describe the role responsibilities, team structure, and candidate expectations..."
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5 form-field">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Company Department</label>
              <input name="department"
                type="text" required 
                className="w-full px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                value={formData.department}
                onChange={handleFormChange}
                placeholder="e.g. Engineering, Product, Design"
              />
            </div>
            <div className="space-y-1.5 form-field">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Employment Type</label>
              <select name="employmentType"
                required 
                className="w-full px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                value={formData.employmentType}
                onChange={handleFormChange}
              >
                <option value="">Select Employment Type...</option>
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5 form-field">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Required Experience (Years)</label>
              <div className="flex items-center gap-3">
                <input
                  name="minExperience"
                  type="number"
                  min="0"
                  required
                  placeholder="Min Yrs"
                  className="w-1/2 px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  value={formData.minExperience}
                  onChange={handleFormChange}
                />
                <span className="text-gray-400 dark:text-zinc-500 font-semibold text-xs uppercase">to</span>
                <input
                  name="maxExperience"
                  type="number"
                  min="0"
                  required
                  placeholder="Max Yrs"
                  className="w-1/2 px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  value={formData.maxExperience}
                  onChange={handleFormChange}
                />
              </div>
            </div>
            
            <div className="space-y-1.5 form-field">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Education Requirement</label>
              <div className="flex flex-wrap gap-2 mb-2 min-h-[44px] p-2 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl">
                {formData.education ? formData.education.split(',').map(e => e.trim()).filter(e => e).map(edu => (
                  <span key={edu} className="px-3 py-1 bg-zinc-200 dark:bg-zinc-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-zinc-700 rounded-lg text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
                    {edu}
                    <button type="button" onClick={() => toggleEducation(edu)} className="hover:text-red-500 transition-colors">&times;</button>
                  </span>
                )) : <span className="text-gray-400 dark:text-zinc-500 text-xs p-1.5 italic">No education level selected</span>}
              </div>

              <div className="flex flex-col gap-2">
                <select
                  className="w-full px-4 py-2.5 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      toggleEducation(e.target.value);
                      e.target.value = "";
                    }
                  }}
                >
                  <option value="">-- Select Predefined Level --</option>
                  {["High School", "Bachelor's", "Master's", "PhD"].map(edu => (
                    <option key={edu} value={edu}>{edu}</option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 min-w-0 px-3 py-2 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                    placeholder="Or type custom education..."
                    value={eduInput}
                    onChange={e => setEduInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (eduInput.trim()) {
                          toggleEducation(eduInput.trim());
                          setEduInput('');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (eduInput.trim()) {
                        toggleEducation(eduInput.trim());
                        setEduInput('');
                      }
                    }}
                    className="px-3.5 py-2 bg-gray-200 dark:bg-zinc-800 hover:bg-gray-300 dark:hover:bg-zinc-700 text-gray-900 dark:text-white rounded-xl transition-colors font-bold text-xs shrink-0"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1.5 form-field">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Required Technical Skills</label>
            <div className="flex flex-wrap gap-2 mb-2 min-h-[44px] p-2 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl">
              {formData.skills ? formData.skills.split(',').map(s => s.trim()).filter(s => s).map(skill => (
                <span key={skill} className="px-3 py-1 bg-primary/10 text-primary-dark dark:text-primary-light border border-primary/20 rounded-lg text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200">
                  {skill}
                  <button type="button" onClick={() => toggleSkill(skill)} className="hover:text-red-500 transition-colors">&times;</button>
                </span>
              )) : <span className="text-gray-400 dark:text-zinc-500 text-xs p-1.5 italic">No skills selected</span>}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
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
                className="px-5 py-3 bg-gray-200 dark:bg-zinc-800 hover:bg-gray-300 dark:hover:bg-zinc-700 text-gray-900 dark:text-white rounded-xl transition-colors font-bold text-xs"
              >
                Add
              </button>
            </div>

            <div className="mt-2 border border-gray-200 dark:border-zinc-800 rounded-xl p-3 max-h-40 overflow-y-auto bg-gray-50/50 dark:bg-zinc-950 custom-scrollbar">
              <div className="flex flex-wrap gap-2">
                {SKILL_OPTIONS.filter(s => s.toLowerCase().includes(skillSearch.toLowerCase())).map(skill => {
                  const isSelected = formData.skills.split(',').map(s => s.trim()).includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isSelected
                        ? 'bg-primary/10 border-primary/40 text-primary-dark dark:text-primary-light'
                        : 'bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                      {skill} {isSelected && '✓'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* AI Questions Parameter Box */}
          <div className="space-y-4 form-field p-5 bg-gray-50/60 dark:bg-zinc-950/60 border border-gray-200 dark:border-zinc-800/80 rounded-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <label className="text-xs font-extrabold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                  <i className="fa-solid fa-robot text-primary"></i>
                  Number of AI-Generated Questions
                </label>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">Specify how many questions the AI should create dynamically based on the job description.</p>
              </div>
              
              <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 p-1.5 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-xs self-start md:self-center">
                <button
                  type="button"
                  disabled={formData.numQuestions <= 1}
                  onClick={() => setFormData(prev => ({ ...prev, numQuestions: Math.max(1, prev.numQuestions - 1) }))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-gray-200 dark:border-zinc-700"
                >
                  <i className="fa-solid fa-minus text-[10px]"></i>
                </button>
                <input name="numQuestions"
                  type="number" min="1" max="25" 
                  className="w-10 text-center bg-transparent border-none text-base font-extrabold text-gray-900 dark:text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={formData.numQuestions}
                  onChange={handleFormChange}
                />
                <button
                  type="button"
                  disabled={formData.numQuestions >= 25}
                  onClick={() => setFormData(prev => ({ ...prev, numQuestions: Math.min(25, prev.numQuestions + 1) }))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all border border-gray-200 dark:border-zinc-700"
                >
                  <i className="fa-solid fa-plus text-[10px]"></i>
                </button>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1.5 form-field">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Difficulty Level</label>
              <select 
                name="difficulty" 
                value={formData.difficulty} 
                onChange={handleFormChange} 
                className="w-full px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
            
            <div className="space-y-1.5 form-field">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Proctoring Strictness</label>
              <select 
                name="strictness" 
                value={formData.strictness} 
                onChange={handleFormChange} 
                className="w-full px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              >
                <option value="Low">Low (Standard monitoring)</option>
                <option value="Medium">Medium (Balanced monitoring)</option>
                <option value="Hard">Strict (Strict anti-cheat checks)</option>
              </select>
            </div>

            <div className="space-y-1.5 form-field">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Max Responses (Optional)</label>
              <input
                type="number"
                name="maxResponses"
                min="1"
                placeholder="Unlimited"
                value={formData.maxResponses}
                onChange={handleFormChange}
                className="w-full px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
              />
            </div>
          </div>

          {/* Manual Questions Box */}
          <div className="space-y-4 form-field p-5 bg-gray-50/60 dark:bg-zinc-950/60 border border-gray-200 dark:border-zinc-800/80 rounded-xl">
            <div>
              <label className="text-xs font-extrabold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                <i className="fa-solid fa-clipboard-question text-primary"></i>
                Manual Interview Questions (Optional)
              </label>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">Add specific mandatory questions you want the AI interviewer to ask.</p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 px-4 py-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition-all"
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
                className="px-5 py-3 bg-gray-200 dark:bg-zinc-800 hover:bg-gray-300 dark:hover:bg-zinc-700 text-gray-900 dark:text-white rounded-xl transition-all font-bold text-xs flex items-center gap-1.5 shrink-0"
              >
                <i className="fa-solid fa-plus text-xs"></i>
                Add
              </button>
            </div>

            {manualQuestions.length > 0 && (
              <div className="space-y-2 mt-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {manualQuestions.map((q, index) => (
                  <div key={index} className="flex items-start justify-between p-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl animate-in fade-in duration-200">
                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                        {index + 1}
                      </span>
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-0.5">{q}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveManualQuestion(index)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    >
                      <i className="fa-solid fa-trash-can text-xs"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Custom Fields Box */}
          <div className="space-y-4 form-field p-5 bg-gray-50/60 dark:bg-zinc-950/60 border border-gray-200 dark:border-zinc-800/80 rounded-xl">
              <div>
                  <label className="text-xs font-extrabold uppercase tracking-wider text-gray-900 dark:text-white flex items-center gap-2">
                      <i className="fa-solid fa-plus-circle text-gray-400"></i>
                      Custom Job Fields (Optional)
                  </label>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">Add additional information fields (e.g. Salary Range, Work Location).</p>
              </div>

              <div className="flex gap-2">
                  <input
                      type="text"
                      className="flex-1 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      placeholder="Field Name (e.g. Location)"
                      value={tempCustomField.key}
                      onChange={e => setTempCustomField({ ...tempCustomField, key: e.target.value })}
                  />
                  <input
                      type="text"
                      className="flex-1 px-4 py-2.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                      placeholder="Field Value (e.g. Remote / Hybrid)"
                      value={tempCustomField.value}
                      onChange={e => setTempCustomField({ ...tempCustomField, value: e.target.value })}
                  />
                  <button type="button" onClick={handleAddCustomField} className="px-4 py-2.5 bg-gray-200 dark:bg-zinc-800 hover:bg-gray-300 dark:hover:bg-zinc-700 text-gray-900 dark:text-white rounded-xl transition-colors font-bold text-xs shrink-0">Add</button>
              </div>

              {customFields.length > 0 && (
                  <div className="space-y-2 mt-4 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {customFields.map((field) => (
                          <div key={field.id} className="flex items-center justify-between p-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl animate-in fade-in">
                              <div className="flex gap-2 text-xs">
                                  <strong className="text-gray-900 dark:text-white">{field.key}:</strong>
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

          <div className="space-y-1.5 form-field">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Application Deadline</label>
            <input name="deadline"
              type="date" 
              className="w-full px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all dark:[color-scheme:dark]"
              value={formData.deadline}
              onChange={handleFormChange}
            />
          </div>
          
          <div className="space-y-3 form-field">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Invite Candidates (Emails & Resumes)</label>
            <div className="flex flex-col sm:flex-row items-center gap-2">
                <input
                    type="email"
                    value={currentEmail}
                    onChange={(e) => setCurrentEmail(e.target.value)}
                    placeholder="Candidate Email"
                    className="w-full sm:flex-1 px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                />
                <input
                    type="tel"
                    value={currentPhone}
                    onChange={(e) => setCurrentPhone(e.target.value)}
                    placeholder="Phone Number (Optional)"
                    className="w-full sm:flex-1 px-4 py-3 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                />
                <button type="button" onClick={handleAddEmail} className="w-full sm:w-auto px-5 py-3 bg-gray-200 dark:bg-zinc-800 hover:bg-gray-300 dark:hover:bg-zinc-700 text-gray-900 dark:text-white rounded-xl transition-colors font-bold text-xs shrink-0">Add Candidate</button>
            </div>
            
            {candidateEmails.length > 0 && (
                <div className="flex flex-col gap-2 mt-3 max-h-[220px] overflow-y-auto pr-1">
                    {candidateEmails.map(email => {
                        const isEditing = editingCandidateEmailKey === email;
                        const phone = candidatePhones[email.toLowerCase()] || '';

                        return (
                            <div key={email} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-gray-50/80 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl p-3 text-xs">
                                {isEditing ? (
                                    <div className="flex-1 flex flex-col sm:flex-row gap-2">
                                        <input 
                                            type="email" 
                                            value={editedEmailInput} 
                                            onChange={(e) => setEditedEmailInput(e.target.value)} 
                                            placeholder="Candidate Email"
                                            className="flex-1 p-2 text-xs border rounded-lg bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
                                            autoFocus
                                        />
                                        <input 
                                            type="tel" 
                                            value={editedPhoneInput} 
                                            onChange={(e) => setEditedPhoneInput(e.target.value)} 
                                            placeholder="Phone Number (e.g. 9876543210)"
                                            className="flex-1 p-2 text-xs border rounded-lg bg-white dark:bg-zinc-900 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
                                        />
                                        <div className="flex gap-1.5 shrink-0 self-end sm:self-center">
                                            <button type="button" onClick={() => handleSaveCandidateEdit(email)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-bold">Save</button>
                                            <button type="button" onClick={() => setEditingCandidateEmailKey(null)} className="bg-gray-200 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 px-2.5 py-1.5 rounded-lg font-bold">Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-gray-900 dark:text-white">{email}</span>
                                            {phone ? (
                                                <span className="text-xs text-blue-600 dark:text-blue-400 font-mono font-bold flex items-center gap-1.5 mt-0.5"><i className="fas fa-phone-alt text-[10px]"></i>{phone}</span>
                                            ) : (
                                                <span className="text-[11px] text-gray-400 dark:text-zinc-500 italic mt-0.5">No contact phone added</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    setEditingCandidateEmailKey(email);
                                                    setEditedEmailInput(email);
                                                    setEditedPhoneInput(phone);
                                                }}
                                                className="p-1.5 text-amber-600 hover:text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg transition-colors"
                                                title="Edit candidate email & contact phone number before sending invite"
                                            >
                                                <i className="fas fa-pencil-alt text-xs"></i>
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={() => handleRemoveEmail(email)} 
                                                className="p-1.5 text-red-500 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                                                title="Remove Candidate"
                                            >
                                                <i className="fas fa-trash-alt text-xs"></i>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="relative flex py-2 items-center form-field">
                <div className="flex-grow border-t border-gray-200 dark:border-zinc-800"></div>
                <span className="flex-shrink mx-4 text-gray-400 dark:text-zinc-500 text-xs font-bold uppercase">OR</span>
                <div className="flex-grow border-t border-gray-200 dark:border-zinc-800"></div>
            </div>

            <div className="form-field">
                <label htmlFor="resume-upload" className={`w-full flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-zinc-900 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-zinc-800 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800/60 transition-colors font-bold text-xs cursor-pointer ${parsingResumes ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {parsingResumes ? (
                        <>
                            <i className="fa-solid fa-circle-notch fa-spin text-xs"></i>
                            Parsing Resumes...
                        </>
                    ) : (
                        <>
                            <i className="fa-solid fa-file-upload text-xs text-primary"></i>
                            Upload Resumes to Auto-Extract Candidates
                        </>
                    )}
                </label>
                <input id="resume-upload" type="file" multiple accept=".pdf,.txt" className="hidden" onChange={handleResumeUpload} disabled={parsingResumes} />
                <p className="text-xs text-center text-gray-500 dark:text-zinc-400 mt-2">Upload PDF/TXT candidate resumes to extract emails and phone numbers.</p>
            </div>

          </div>

          <div className="pt-4 form-field">
            <button
              type="submit"
              disabled={loading || sendingEmails}
              className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-extrabold py-4 px-6 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.99] border border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-sm"
            >
              {loading || sendingEmails ? (
                <>
                  <i className="fa-solid fa-circle-notch fa-spin"></i>
                  {loading ? 'Saving Interview...' : `Dispatching Invitations...`}
                </>
              ) : (
                <>
                  <i className="fa-solid fa-paper-plane text-xs"></i>
                  Create Interview & Send Invitations
                </>
              )}
            </button>
            <p className="text-center text-xs text-gray-500 dark:text-zinc-400 mt-3 italic">
              Generates access codes and dispatches Email & WhatsApp invitations automatically.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateInterview;