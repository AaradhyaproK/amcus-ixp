const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.VITE_GEMINI_API_KEY });
async function test() {
  try {
    const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
    for (const m of models) {
        try {
            console.log("Trying", m);
            await ai.models.generateContent({
                model: m,
                contents: "Hello 1"
            });
            console.log("Success with", m);
            return;
        } catch (e) {
            console.error("Failed", m, e.message);
        }
    }
  } catch (e) { console.error(e); }
}
test();
