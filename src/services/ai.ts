// File: src/services/ai.ts
import axios from 'axios';
import logger from '../utils/logger.js';

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

export const chatWithAI = async (prompt: string, isPremium: boolean) => {
  if (!isPremium) {
    throw new Error('AI Tutor is available for Premium users only');
  }

  try {
    const response = await axios.post(
      OPENROUTER_API,
      {
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 seconds
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    logger.error('AI chat error:', error);
    throw new Error('AI service unavailable');
  }
};
