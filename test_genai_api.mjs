import { GoogleGenAI } from '@google/genai';

try {
    const client = new GoogleGenAI({ apiKey: 'test-key' });
    console.log('Client keys:', Object.keys(client));
    console.log('Client prototype keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(client)));

    if (client.models) {
        console.log('Client.models keys:', Object.keys(client.models));
        console.log('Client.models proto:', Object.getOwnPropertyNames(Object.getPrototypeOf(client.models)));
    }
} catch (e) {
    console.error(e);
}
