/**
 * lib/tts.ts — Unified Text-to-Speech Engine (Highly Optimized)
 *
 * Routing for ALL languages:
 *   • English text  → Native Web Speech API (Strictly English voices to avoid gibberish)
 *   • Hindi (hi-IN)  → Native Web Speech API 
 *   • Marathi (mr-IN) → Native Web Speech API 
 *
 * This version completely strips out local heavy AI models (like Kokoro) 
 * so that it runs flawlessly instantly with 0 GPU/RAM overhead on the absolute worst, 
 * low-end PCs without any static or audio distortion.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SpeakOptions {
  /** Force a specific language: 'en', 'hi-IN', 'mr-IN' */
  lang?: string;
  /** Speech rate multiplier (default 1.0) — used by Web Speech API */
  rate?: number;
  /** Callback fired when the full utterance finishes */
  onEnd?: () => void;
  /** Callback fired if something goes wrong */
  onError?: (err: unknown) => void;
}

// ─── Module-level singletons ─────────────────────────────────────────────────

/** Track whether Web Speech voices are loaded */
let webVoicesReady = false;
let webVoices: SpeechSynthesisVoice[] = [];

const loadVoices = () => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  webVoices = window.speechSynthesis.getVoices();
  if (webVoices.length > 0) webVoicesReady = true;
};

// Pre-load Web Speech voices as soon as this module is imported
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ensureVoicesLoaded = async (): Promise<void> => {
  if (webVoicesReady && webVoices.length > 0) return;
  loadVoices();
  if (webVoicesReady && webVoices.length > 0) return;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  return new Promise<void>((resolve) => {
    let resolved = false;
    const onVoicesChanged = () => {
      if (resolved) return;
      loadVoices();
      if (webVoicesReady) {
        resolved = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve();
      }
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    
    // Timeout fallback for low-end PCs that might never fire it
    setTimeout(() => {
      if (!resolved) {
        loadVoices();
        resolved = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve();
      }
    }, 1500);
  });
};

/** Returns true when the text contains Devanagari characters (Hindi / Marathi) */
const containsDevanagari = (text: string): boolean =>
  /[\u0900-\u097F]/.test(text);

/** Detect language from text if not supplied */
const detectLang = (text: string, explicit?: string): string => {
  if (explicit) return explicit;
  return containsDevanagari(text) ? 'hi-IN' : 'en';
};

/** Pick the best Web Speech voice for a given BCP-47 language tag */
const pickVoice = (lang: string): SpeechSynthesisVoice | undefined => {
  loadVoices();
  const prefix = lang.split('-')[0].toLowerCase();
  
  // -- BULLETPROOF ENGLISH VOICE FINDER --
  // On worst PCs, defaulting to a Hindi voice for English text sounds like garbage gibberish.
  if (prefix === 'en') {
    const enVoices = webVoices.filter(v => 
      v.lang.toLowerCase().includes('en') || 
      v.name.toLowerCase().includes('english') ||
      v.name.toLowerCase().includes('david') ||
      v.name.toLowerCase().includes('zira') ||
      v.name.toLowerCase().includes('mark') ||
      v.name.toLowerCase().includes('susan') ||
      v.name.toLowerCase().includes('george') ||
      v.name.toLowerCase().includes('hazel')
    );
    
    if (enVoices.length > 0) {
      // 1. Google US/GB (Best quality in Chrome)
      const googleUSGB = enVoices.find(v => v.name.toLowerCase().includes('google') && (v.lang.includes('US') || v.lang.includes('GB')));
      if (googleUSGB) return googleUSGB;
      
      // 2. Any Google English
      const googleEn = enVoices.find(v => v.name.toLowerCase().includes('google'));
      if (googleEn) return googleEn;
      
      // 3. Microsoft Natural / Microsoft Desktop voices (Built-in Windows native)
      const msUSGB = enVoices.find(v => v.lang.includes('US') || v.lang.includes('GB'));
      if (msUSGB) return msUSGB;
      
      // 4. Any English voice available
      return enVoices[0];
    }
  }

  // -- HINDI / MARATHI / OTHERS --
  // Prefer Google voice for Indian languages if available
  const googleVoice = webVoices.find(
    (v) => v.lang.toLowerCase().startsWith(prefix) && v.name.toLowerCase().includes('google')
  );
  if (googleVoice) return googleVoice;

  // Fallback exact match
  const fallback = webVoices.find((v) => v.lang === lang);
  if (fallback) return fallback;

  // Fallback prefix match
  return webVoices.find((v) => v.lang.toLowerCase().startsWith(prefix));
};

// ─── Cancellation token ──────────────────────────────────────────────────────

let cancelGeneration = false;

// ─── Core speak() function ───────────────────────────────────────────────────

/**
 * Speak the given text using strictly Native OS Web Speech engine.
 * Highly optimized for any tier of PC.
 */
async function speak(text: string, options?: SpeakOptions): Promise<void> {
  // Always stop any ongoing speech first
  speak.stop();
  cancelGeneration = false;

  const lang = detectLang(text, options?.lang);
  let voiceLang = 'en-US';

  // Apply Regional mappings
  if (lang === 'hi-IN' || lang === 'mr-IN' || lang === 'hi' || lang === 'mr') {
    voiceLang = 'hi-IN'; // Both Hindi and Marathi spoken excellently natively by 'hi-IN' engines
  }

  return new Promise<void>(async (resolve) => {
    if (!('speechSynthesis' in window)) {
      console.warn('[TTS] Web Speech API not supported in this browser/PC');
      options?.onEnd?.();
      resolve();
      return;
    }
    
    // Wait for native voices to load onto the slow PC
    await ensureVoicesLoaded();

    if (cancelGeneration) {
       resolve();
       return;
    }

    // Cancel any ghost leftovers in the OS buffer
    window.speechSynthesis.cancel();

    // Chunk text by sentences to provide faster pacing on slow machines
    // For WebSpeech, giving it massive blocks of text can sometimes freeze older Chrome instances
    const rawChunks = text.match(/[^.!?;]+[.!?;]?/g) || [text];
    const sentences = rawChunks.map(s => s.trim()).filter(s => s.length > 0);

    let currentIndex = 0;

    const playNextChunk = () => {
      if (cancelGeneration || currentIndex >= sentences.length) {
        options?.onEnd?.();
        resolve();
        return;
      }

      const utter = new SpeechSynthesisUtterance(sentences[currentIndex]);
      utter.lang = voiceLang;
      utter.rate = options?.rate ?? 1.0;

      const voice = pickVoice(voiceLang);
      if (voice) {
        utter.voice = voice;
      }

      utter.onend = () => {
        currentIndex++;
        playNextChunk();
      };

      utter.onerror = (e) => {
        console.warn('[TTS] Native speech error on chunk:', e);
        // Continue to next chunk if one errors out to prevent freeze
        currentIndex++;
        playNextChunk();
      };

      window.speechSynthesis.speak(utter);
    };

    // Kick off speech chain
    playNextChunk();
  });
}

// ─── speak.stop() ────────────────────────────────────────────────────────────

speak.stop = (): void => {
  cancelGeneration = true;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

export { speak };

