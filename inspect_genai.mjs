import * as genai from '@google/genai';
try {
    console.log('Keys:', Object.keys(genai));
    // Check for expected classes
    if (genai.GoogleGenerativeAI) console.log('Found GoogleGenerativeAI');
    if (genai.GoogleGenAI) console.log('Found GoogleGenAI');
    if (genai.Client) console.log('Found Client');
} catch (e) {
    console.error(e);
}
