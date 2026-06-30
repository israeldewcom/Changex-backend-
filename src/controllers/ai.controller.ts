// ============================================================
// FILE: src/controllers/ai.controller.ts (FIXED TYPESCRIPT)
// Complete – With Premium Checks & Image Generation
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import redis from '../config/redis.js';

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_IMAGE_API = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY = process.env.OPENROUTER_API_KEY || '';

// Free models
const MODELS = {
  reasoning: 'deepseek/deepseek-r1',
  fast: 'google/gemini-2.0-flash-exp',
  balanced: 'mistralai/mistral-7b-instruct',
  open: 'meta-llama/llama-3.1-8b-instruct',
  image: 'stabilityai/stable-diffusion-3.5-large',
};

const SYSTEM_PROMPT = `
You are the ChangeX AI Tutor – a friendly, knowledgeable mentor for tech students in Nigeria and Africa.
Keep responses practical, actionable, and encouraging. Use relatable examples (Nigerian context).
Break down complex topics into simple steps. Suggest ChangeX courses when relevant.
Be warm, conversational, and use emojis occasionally.
`;

// ─── CHAT ENDPOINT (with history) ────────────────────────────────
export const chat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Prompt is required' });
    }

    const isPremium = user?.isPremium || false;
    const userId = user?._id?.toString() || 'anonymous';
    const sessionKey = `chat:${userId}`;
    const limitKey = `chat:limit:${userId}:${new Date().toDateString()}`;

    // ── Daily limit for free users ──
    if (!isPremium) {
      const count = await redis.incr(limitKey);
      if (count > 10) {
        return res.status(429).json({
          success: false,
          message: 'Daily free chat limit reached. Upgrade to Premium for unlimited!'
        });
      }
      await redis.expire(limitKey, 86400);
    }

    // ── Retrieve history ──
    let history: Array<{ role: string; content: string }> = [];
    const stored = await redis.get(sessionKey);
    if (stored) {
      try {
        history = JSON.parse(stored);
      } catch (_e) { history = []; }
    }

    // ── Build messages ──
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: prompt },
    ];

    // ── Generate responses (parallel ensemble) ──
    const modelList = [MODELS.reasoning, MODELS.fast, MODELS.balanced];
    const responses = await Promise.allSettled(
      modelList.map(model => callOpenRouterWithMessages(messages, model))
    );

    const successful = responses
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<{ text: string; model: string }>).value);

    if (successful.length === 0) {
      const fallback = await callOpenRouterWithMessages(messages, MODELS.open).catch(() => null);
      const text = fallback?.text || getFallbackResponse(prompt);
      return res.json({ success: true, data: { response: text, mode: 'fallback' } });
    }

    // ── Choose best response ──
    const scored = successful.map(r => {
      const score = (r.text?.length || 0) + (r.text?.includes('```') ? 50 : 0);
      return { ...r, score };
    });
    const best = scored.reduce((a, b) => a.score > b.score ? a : b);

    // ── Reflection ──
    let finalText = best.text;
    try {
      const critiqueMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history,
        { role: 'user', content: prompt },
        { role: 'assistant', content: best.text },
        { role: 'user', content: `Please refine your previous answer to be more accurate, actionable, and encouraging. Return only the improved version.` }
      ];
      const refined = await callOpenRouterWithMessages(critiqueMessages, MODELS.fast);
      if (refined?.text) finalText = refined.text;
    } catch (_err) {
      console.warn('Reflection failed, using best response.');
    }

    // ── Enrich ──
    finalText = enrichResponse(finalText, prompt);

    // ── Save history ──
    history.push({ role: 'user', content: prompt });
    history.push({ role: 'assistant', content: finalText });
    if (history.length > 20) {
      history = history.slice(-20);
    }
    await redis.setex(sessionKey, 86400 * 30, JSON.stringify(history));

    res.json({
      success: true,
      data: {
        response: finalText,
        ensemble: {
          modelsUsed: successful.map(r => r.model),
          primaryModel: best.model,
          reflectionApplied: finalText !== best.text,
        },
        historyCount: history.length,
      }
    });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ success: false, message: 'AI service temporarily unavailable.' });
  }
};

// ─── OPENROUTER CALL (messages) ────────────────────────────────────
async function callOpenRouterWithMessages(
  messages: Array<{ role: string; content: string }>,
  model: string,
  temperature = 0.7
): Promise<{ text: string; model: string }> {
  const response = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.FRONTEND_URL || 'https://changex.academy',
      'X-Title': 'ChangeX Academy',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: 1024,
      top_p: 0.9,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenRouter error: ${error.message || response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return { text: content, model: data.model || model };
}

// ─── ENRICHMENT ──────────────────────────────────────────────────────
function enrichResponse(content: string, prompt: string): string {
  let enriched = content;

  const courseKeywords = ['html', 'css', 'javascript', 'react', 'freelancing', 'coding'];
  const hasCourseTopic = courseKeywords.some(k => prompt.toLowerCase().includes(k));
  if (hasCourseTopic && !content.includes('ChangeX')) {
    enriched += `\n\n💡 Want to dive deeper? Check out our **${prompt.substring(0, 30)}...** course on ChangeX Academy! 🚀`;
  }

  if (Math.random() > 0.75) {
    const tips = [
      '\n\n🔥 Consistency beats intensity – keep showing up every day!',
      '\n\n💡 Pro tip: Build 3 small projects to master any skill.',
      '\n\n🌟 The best time to start was yesterday. The second best time is NOW.',
      '\n\n💰 Every hour you invest in learning is an investment in your future income.',
    ];
    enriched += tips[Math.floor(Math.random() * tips.length)];
  }

  return enriched;
}

// ─── FALLBACK ────────────────────────────────────────────────────────
function getFallbackResponse(prompt: string): string {
  const fallbacks = [
    "Hey! 🎯 That's a great question. While I'm thinking, here's a quick tip: **Break big problems into small chunks**. What part are you stuck on?",
    "I'm currently processing your request. Meanwhile, remember: **The best way to learn is to build something you're passionate about**. What's your dream project?",
    "Interesting question! 🤔 If I were you, I'd start by writing down 3 things you already know about this topic. Then, identify 1 thing you need to learn. You've got this!",
    "I'm here to help you crush this! 💪 Can you tell me a bit more about what you're trying to achieve? That way I can give you the best advice.",
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ─── FILE UPLOAD (PREMIUM ONLY) ──────────────────────────────────────
export const uploadFileForAnalysis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const isPremium = user?.isPremium || false;

    if (!isPremium) {
      return res.status(403).json({
        success: false,
        message: 'File uploads are a Premium feature. Upgrade to Premium to upload and analyse files!'
      });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const filename = req.file.originalname;
    let content = req.file.buffer.toString('utf-8').substring(0, 500);

    const analysisPrompt = `
      A student uploaded a file: "${filename}".
      Content preview: ${content}
      Provide:
      1. Summary
      2. Key concepts
      3. 3 practical questions
      4. Career relevance
      Keep it friendly.
    `;

    let analysis = '';
    try {
      const result = await callOpenRouterWithMessages(
        [{ role: 'user', content: analysisPrompt }],
        MODELS.balanced
      );
      analysis = result.text;
    } catch (_err) {
      analysis = `📄 I've received your file "${filename}". Ask me specific questions about it in the chat!`;
    }

    res.json({
      success: true,
      data: {
        filename,
        fileSize: req.file.size,
        analysis,
      }
    });
  } catch (err) {
    console.error('AI file analysis error:', err);
    res.status(500).json({ success: false, message: 'File analysis failed.' });
  }
};

// ─── IMAGE GENERATION (PREMIUM ONLY) ─────────────────────────────────
export const generateImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const isPremium = user?.isPremium || false;

    if (!isPremium) {
      return res.status(403).json({
        success: false,
        message: 'Image generation is a Premium feature. Upgrade to Premium to generate images!'
      });
    }

    const { prompt, width = 512, height = 512 } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Prompt is required' });
    }

    let imageUrl = '';
    try {
      const response = await fetch(OPENROUTER_IMAGE_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.FRONTEND_URL || 'https://changex.academy',
          'X-Title': 'ChangeX Academy',
        },
        body: JSON.stringify({
          model: MODELS.image,
          prompt,
          width,
          height,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.warn('Image generation failed:', error);
        throw new Error('Image generation service unavailable.');
      }

      const data = await response.json();
      imageUrl = data.choices?.[0]?.message?.content || data.url || '';
    } catch (err) {
      // Type guard to safely access message
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn('Image generation fallback:', errorMessage);
      // Fallback: use picsum placeholder
      imageUrl = `https://picsum.photos/seed/${encodeURIComponent(prompt)}/${width}/${height}`;
    }

    res.json({
      success: true,
      data: {
        imageUrl,
        prompt,
        width,
        height,
      }
    });
  } catch (err) {
    console.error('Image generation error:', err);
    res.status(500).json({ success: false, message: 'Image generation failed. Please try again.' });
  }
};

// ─── CLEAR HISTORY ────────────────────────────────────────────────────
export const clearHistory = async (req: Request, res: Response) => {
  try {
    const user = req.user as IUser;
    const userId = user?._id?.toString() || 'anonymous';
    await redis.del(`chat:${userId}`);
    res.json({ success: true, message: 'Chat history cleared.' });
  } catch (err) {
    res.status(500).json({ success: false, message: String(err) });
  }
};
