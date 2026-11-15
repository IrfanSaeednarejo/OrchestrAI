import { GoogleGenAI } from '@google/genai';
import { config } from './shared/config.js';
import { z } from 'zod';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

const OrderIdExtractionSchema = z.object({
  orderId: z.string().uuid().nullable(),
  confidence: z.number().min(0).max(1),
});

async function main() {
  const userText = 'My order ID is 06e54732-960c-438e-b68e-58e645a6f998';
  const prompt = `Extract the order ID (a UUID) from the following customer message.
If a valid UUID order ID is present, return it. If not found or unclear, return null.

Customer message: "${userText}"

Respond with JSON: { "orderId": "<uuid or null>", "confidence": <0.0-1.0> }`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.0,
    },
  });

  console.log('Response text:', response.text);
  const parsed = JSON.parse(response.text ?? '{}');
  const validated = OrderIdExtractionSchema.parse(parsed);
  console.log('Validated extraction:', validated);
}

main().catch(console.error);
