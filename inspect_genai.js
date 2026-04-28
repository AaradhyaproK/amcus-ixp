const genai = require('@google/genai');
console.log('Exports:', Object.keys(genai));
try {
    const { GoogleGenerativeAI } = genai;
    console.log('GoogleGenerativeAI:', !!GoogleGenerativeAI);
    const { GoogleGenAI } = genai;
    console.log('GoogleGenAI:', !!GoogleGenAI);
    const { Client } = genai;
    console.log('Client:', !!Client);
} catch (e) {
    console.error(e);
}
