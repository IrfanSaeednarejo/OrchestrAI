import { GoogleGenAI } from '@google/genai';
import { config } from '../shared/config.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

export async function embedDocument(text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-2',
    contents: `title: none | text: ${text}`,
    config: {
      outputDimensionality: 768,
    },
  });

  if (!response.embeddings?.[0]?.values) {
    throw new Error('No embedding returned from Gemini API');
  }

  return response.embeddings[0].values;
}

export async function embedQuery(text: string): Promise<number[]> {
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-2',
    contents: `task: search result | query: ${text}`,
    config: {
      outputDimensionality: 768,
    },
  });

  if (!response.embeddings?.[0]?.values) {
    throw new Error('No embedding returned from Gemini API');
  }

  return response.embeddings[0].values;
}
