import { useState } from 'react';

/**
 * Transcribes an audio/video blob using a backend endpoint.
 * @param videoBlob The video or audio file to transcribe.
 * @param language The language of the audio in ISO-639-1 format (e.g., 'en', 'hi', 'mr').
 * @returns The transcribed text.
 */
async function transcribeVideo(videoBlob: Blob, language: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', videoBlob, 'interview_answer.webm');
  formData.append('language', language);

  // IMPORTANT: This should be an endpoint on YOUR backend server.
  // Your server will then securely call the transcription service (e.g., OpenAI Whisper).
  // This prevents exposing your API keys to the client.
  const response = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Transcription failed');
  }

  return data.transcript;
}


export const useTranscription = (language: string) => {
  const [transcript, setTranscript] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startTranscription = async (videoBlob: Blob) => {
    setIsTranscribing(true);
    setError(null);
    try {
      // Pass the selected language to the transcription function.
      // Whisper uses ISO-639-1 codes, which we are using ('en', 'hi', 'mr').
      const result = await transcribeVideo(videoBlob, language);
      setTranscript(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  return { transcript, isTranscribing, error, startTranscription };
};