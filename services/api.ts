import { grokGenerateWithResume, grokGenerateText, BUDGET } from "./grokService";

// Config Constants (loaded from environment variables)
const ASSEMBLYAI_API_KEY = import.meta.env.VITE_ASSEMBLYAI_API_KEY;
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const VIDEO_CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;
const RESUME_CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const AUTO_CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
const RAW_CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`;
const ASSEMBLYAI_TRANSCRIPT_ENDPOINT = 'https://api.assemblyai.com/v2/transcript';

// ── Token-saving helpers ──────────────────────────────────────────────────────
// Truncate long strings at the source so we never send walls of text to the API.
const truncate = (s: string, max: number) =>
  s && s.length > max ? s.slice(0, max) + '…' : (s || '');

// Resume: 3000 chars provides much better context for a complete analysis.
const RESUME_MAX_CHARS = 3000;
// JD: 2000 chars keeps the role context without padding.
const JD_MAX_CHARS = 2000;
// Transcript per answer: cap long rambling answers to save feedback input tokens.
const TRANSCRIPT_MAX_CHARS = 1000;

// ── TTS ───────────────────────────────────────────────────────────────────────
export const generateOpenAITTS = async (text: string) => {
  const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key missing. Add VITE_OPENAI_API_KEY to .env.");
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: "tts-1", input: text, voice: "alloy" })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || "OpenAI TTS failed");
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

// ── Interview Question Generation ─────────────────────────────────────────────
export const generateInterviewQuestions = async (
  jobTitle: string,
  jobDescription: string,
  candidateExp: string,
  base64Resume: string,
  mimeType: string,
  languageCode: string = 'en',
  numQuestions: number = 5,
  resumeTextContent?: string
) => {
  // Language-specific instructions for easy, natural language
  let langInstruction = '';
  if (languageCode === 'mr') {
    langInstruction = `Language: Marathi (Devanagari script).
IMPORTANT: Use simple, everyday Marathi that common people speak. Do NOT use heavy/literary Marathi words. If any word is difficult or technical (like "quality management", "KPI", "compliance", "production planning" etc.), keep that word in English and write the rest in easy Marathi. The question should feel natural like a normal conversation, not like a textbook.`;
  } else if (languageCode === 'hi') {
    langInstruction = `Language: Hindi (Devanagari script).
IMPORTANT: Use simple, everyday Hindi that common people speak. Do NOT use heavy/Shudh Hindi words. If any word is difficult or technical (like "quality management", "KPI", "compliance", "production planning" etc.), keep that word in English and write the rest in easy Hindi. The question should feel natural like a normal conversation, not like a textbook.`;
  } else {
    langInstruction = 'Language: English.';
  }

  // Truncate to save input tokens
  const jd  = truncate(jobDescription, JD_MAX_CHARS);
  const exp = truncate(candidateExp, 150);

  const sys = `You are a polite, professional HR interviewer. Your tone is gentle, respectful, and conversational.
Rules:
- Ask short, clear, straight-to-the-point questions.
- No difficult or fancy language.
- One question per line. No numbering, bullets, preamble, or closing text.
- Output ONLY the questions, nothing else.`;

  const prompt =
`Role: "${jobTitle}"
JD: ${jd}
Experience: ${exp}
${langInstruction}

Generate exactly ${numQuestions} verification questions. Your goal is to VERIFY whether this candidate genuinely has the skills, experience, and project knowledge they claim on their resume.

How to generate questions:
1. Read the candidate's resume carefully — look at their skills, projects, past roles, tools, and achievements.
2. Cross-check these claims against the JD requirements.
3. Ask practical, real-world questions that only someone who has actually done that work would be able to answer confidently. For example:
   - If resume says "managed quality audits" → ask "Walk me through how you conducted a quality audit at your last company. What was the outcome?"
   - If resume says "React.js" → ask "In your project [X], how did you handle state management and why did you choose that approach?"
   - If resume says "3 years experience in production planning" → ask "Tell me about a time when your production plan failed. What went wrong and how did you fix it?"
4. Do NOT ask generic textbook questions. Every question must reference something specific from the resume or JD.
5. Mix questions across: skills verification, project deep-dives, situational/behavioral, and JD-specific requirements.
6. The candidate should feel like you have actually read their resume.`;

  try {
    const text = await grokGenerateWithResume(sys, prompt, base64Resume, mimeType, 0.5, BUDGET.QUESTIONS, resumeTextContent);
    const clean = text.replace(/^\s*[\d\.\-\*\+]+\s*/gm, '').replace(/\*\*/g, '').trim();
    return clean.split('\n').map(q => q.trim()).filter(q => q && q.length > 5).slice(0, numQuestions);
  } catch (error: any) {
    console.error("Grok Generate Questions Error:", error);
    throw new Error(error.message || "Failed to generate questions");
  }
};

// ── Feedback / Report Generation ──────────────────────────────────────────────
export const generateFeedback = async (
  jobTitle: string,
  jobDescription: string,
  candidateExp: string,
  base64Resume: string,
  mimeType: string,
  questions: string[],
  transcripts: string[],
  resumeTextContent?: string
) => {
  const jd  = truncate(jobDescription, JD_MAX_CHARS);
  const exp = truncate(candidateExp, 150);

  // Build Q&A block — each transcript is capped to save tokens
  const qaBlock = questions.map((q, i) => {
    const ans = truncate(transcripts[i] || '(no answer given)', TRANSCRIPT_MAX_CHARS);
    return `Q${i + 1}: ${q}\nA${i + 1}: ${ans}`;
  }).join('\n\n---\n\n');

  const sys = `You are an experienced hiring manager evaluating a candidate after an interview. Your goal is to provide a realistic, accurate, and human-like hiring assessment. Be fair and practical, focusing on job readiness over perfection. If the candidate shows reasonable understanding and decent communication, avoid very low scores. If answers are mostly correct but imperfect, consider them positively. This is an interview, not an academic test. Adhere strictly to the output format provided.`;

  const feedbackPrompt =
`## Candidate Evaluation

**ROLE:** ${jobTitle}
**CANDIDATE STATED EXPERIENCE:** ${exp}

---

### JOB DESCRIPTION
${jd}

---

### INTERVIEW TRANSCRIPT
${qaBlock}

---

### EVALUATION TASK

Based on the Job Description, the candidate's resume (provided in context), and their Q&A performance, provide a comprehensive evaluation.

**1. Resume Analysis (Role Fit):**
   - **Goal:** Assess the candidate's **Role Fit**.
   - **Action:** Clearly state how well the candidate fits the role (e.g., Strong Fit, Moderate Fit, Partial Fit, Not a Fit). Explain WHY in 2–3 lines, referencing their resume and experience against the job description.

**2. Answer Quality (Communication & Technical Skills):**
   - **Goal:** Evaluate **Communication & Technical Skills**.
   - **Action:** Evaluate how clearly and effectively the candidate communicated (clarity, confidence, structure). Also, evaluate their technical/domain skills based on both resume and answers, mentioning if they demonstrate practical understanding.

**3. Overall Evaluation (Summary):**
   - **Goal:** Provide a **Summary**.
   - **Action:** Write a concise 2–3 line summary of the candidate’s overall performance.

**4. Verdict (Final Verdict):**
   - **Goal:** Give a clear **Final Verdict**.
   - **Action:** State if the candidate is a "Strong Hire", "Hire", "Leaning No", or "No Hire". Keep it professional and balanced.

**5. Scoring (MANDATORY):**
   - **Resume Score:** A numerical score from 0-100 based on the resume's alignment with the JD.
   - **Q&A Score:** A numerical score from 0-100 based on the quality and accuracy of their answers.
   - **DO NOT** provide an "Overall Score". The application will calculate it.

---

### OUTPUT FORMAT (Strictly follow this structure)

**Resume Analysis:**
- [Bullet point analysis of resume vs JD]
- [Identify a key strength]
- [Identify a key weakness or gap]

**Answer Quality:**
- [Bullet point analysis of answer quality]
- [Comment on strongest/weakest answer]
- [Overall communication style assessment]

**Overall Evaluation:**
[Your 1-2 sentence executive summary.]

**Verdict:** [Strong Hire | Hire | Leaning No | No Hire]

**Scores:**
Resume Score: [SCORE]/100
Q&A Score: [SCORE]/100
`;

  try {
    const result = await grokGenerateWithResume(sys, feedbackPrompt, base64Resume, mimeType, 0.2, BUDGET.FEEDBACK, resumeTextContent);
    return result || "AI feedback generation failed.";
  } catch (error: any) {
    console.error("Grok Feedback Error:", error);
    throw new Error(error.message);
  }
};

// ── Invite Resume Match ────────────────────────────────────────────────────────
export const evaluateResumeMatch = async (
  jobTitle: string,
  jobDescription: string,
  resumeText: string
): Promise<string> => {
  const jd = truncate(jobDescription, JD_MAX_CHARS);
  const sys = `You are a strict HR recruiter. Calculate a Resume Match Percentage (0 to 100) based strictly on how well the candidate's resume aligns with the Job Description. Be highly critical.`;
  const prompt = `Role: ${jobTitle}\nJD: ${jd}\n\nResume:\n${truncate(resumeText, RESUME_MAX_CHARS)}\n\nOutput ONLY an integer number between 0 and 100 representing the match percentage (e.g. 85). Do not output any other text or percentage signs.`;

  try {
    const result = await grokGenerateText(sys, prompt, 0.1, 10);
    const score = parseInt(result.trim(), 10);
    if (isNaN(score)) return "N/A";
    return score.toString();
  } catch (error: any) {
    console.error("Grok Resume Match Error:", error);
    return "N/A";
  }
};

// ── Multi-Job Resume Match ───────────────────────────────────────────────────
export const evaluateResumeForMultipleJobs = async (
  jobs: { id: string; title: string; description: string }[],
  resumeText: string
): Promise<Record<string, string>> => {
  if (jobs.length === 0) return {};

  const jobsContext = jobs.map(j => `Job ID: ${j.id}\nTitle: ${j.title}\nJD: ${truncate(j.description, JD_MAX_CHARS / 2)}`).join('\n\n');
  const sys = `You are a strict HR recruiter. Evaluate a candidate's resume against multiple job descriptions. Output ONLY a valid JSON object where keys are Job IDs and values are integer match percentages (0-100). Do NOT output markdown formatting like \`\`\`json.`;
  const prompt = `Jobs:\n${jobsContext}\n\nResume:\n${truncate(resumeText, RESUME_MAX_CHARS)}\n\nOutput strictly JSON mapping Job ID to percentage match. Example: {"job123": 85, "job456": 40}`;

  try {
    const result = await grokGenerateText(sys, prompt, 0.1, 50 + jobs.length * 20);
    // Remove any markdown block syntax if the AI mistakenly includes it
    const cleanResult = result.replace(/```json/g, '').replace(/```/g, '').trim();
    const scores = JSON.parse(cleanResult);
    
    // Ensure it's a record of strings
    const formattedScores: Record<string, string> = {};
    for (const [key, val] of Object.entries(scores)) {
        formattedScores[key] = String(val);
    }
    return formattedScores;
  } catch (error: any) {
    console.error("Grok Multi-Job Resume Match Error:", error);
    return {};
  }
};

// ── Cloudinary ────────────────────────────────────────────────────────────────
export const uploadToCloudinary = async (blob: Blob, resourceType: 'video' | 'image' | 'auto' | 'raw' = 'auto') => {
  const isVideo = resourceType === 'video';
  const isRaw = resourceType === 'raw';
  const uploadUrl = resourceType === 'auto'
    ? AUTO_CLOUDINARY_UPLOAD_URL
    : (isVideo ? VIDEO_CLOUDINARY_UPLOAD_URL : (isRaw ? RAW_CLOUDINARY_UPLOAD_URL : RESUME_CLOUDINARY_UPLOAD_URL));

  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  try {
    const response = await fetch(uploadUrl, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error?.message || response.statusText);
    return data.secure_url;
  } catch (error: any) {
    console.error("Cloudinary Upload Error:", error);
    throw error;
  }
};

// ── AssemblyAI ────────────────────────────────────────────────────────────────
export const requestTranscription = async (audioUrl: string, languageCode: string = 'en') => {
  try {
    const body: any = { audio_url: audioUrl, language_code: languageCode };
    if (languageCode !== 'en') body.speech_model = 'nano';
    const response = await fetch(ASSEMBLYAI_TRANSCRIPT_ENDPOINT, {
      method: 'POST',
      headers: { 'authorization': ASSEMBLYAI_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Transcription request failed");
    return data.id;
  } catch (error: any) {
    console.error("AssemblyAI Request Error:", error);
    throw error;
  }
};

export const fetchTranscriptText = async (transcriptId: string) => {
  try {
    const response = await fetch(`${ASSEMBLYAI_TRANSCRIPT_ENDPOINT}/${transcriptId}`, {
      method: 'GET',
      headers: { 'authorization': ASSEMBLYAI_API_KEY }
    });
    const data = await response.json();
    if (data.status === 'completed') return { status: 'completed', text: data.text || '(No speech detected)' };
    if (data.status === 'error') return { status: 'error', text: `Error: ${data.error}` };
    return { status: data.status, text: null };
  } catch (error: any) {
    return { status: 'error', text: `Error: ${error.message}` };
  }
};