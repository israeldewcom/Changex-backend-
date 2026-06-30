// ============================================================
// FILE: src/controllers/ai.controller.ts
// Complete – Parallel Ensemble AI Tutor
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { IUser } from '../models/User.js';
import redis from '../config/redis.js';

// ─── OpenRouter Configuration ───────────────────────────────────
const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY = process.env.OPENROUTER_API_KEY || '';

// Free models (ordered by preference)
const MODELS = {
  reasoning: 'deepseek/deepseek-r1',        // Best at step‑by‑step reasoning
  fast: 'google/gemini-2.0-flash-exp',      // Fast, good generalist
  balanced: 'mistralai/mistral-7b-instruct', // Balanced, coherent
  open: 'meta-llama/llama-3.1-8b-instruct', // Open source, reliable
};

const SYSTEM_PROMPT = `
You are the ChangeX AI Tutor – a friendly, knowledgeable mentor for tech students in Nigeria and Africa.
Your goal is to help users learn coding, web development, freelancing, and tech careers.
Keep responses practical, actionable, and encouraging. Use relatable examples (Nigerian context).
Break down complex topics into simple steps. Suggest ChangeX courses when relevant.
Be warm, conversational, and use emojis occasionally.
`;

// ─── CHAT ENDPOINT – ENSEMBLE MODE ────────────────────────────
export const chat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, message: 'Prompt is required' });
    }

    // Check daily limit for free users
    const isPremium = user?.isPremium || false;
    const chatKey = `chat:${user?._id}:${new Date().toDateString()}`;
    if (!isPremium) {
      const count = await redis.incr(chatKey);
      if (count > 10) {
        return res.status(429).json({
          success: false,
          message: 'Daily free chat limit reached. Upgrade to Premium for unlimited!'
        });
      }
      await redis.expire(chatKey, 86400); // 24 hours
    }

    // ── Step 1: Generate initial responses in parallel ──
    const modelList = [MODELS.reasoning, MODELS.fast, MODELS.balanced];
    const responses = await Promise.allSettled(
      modelList.map(model => callOpenRouter(prompt, model))
    );

    // Extract successful responses
    const successful = responses
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<{ text: string; model: string }>).value);

    if (successful.length === 0) {
      // Fallback: use the open model or a hardcoded response
      const fallback = await callOpenRouter(prompt, MODELS.open).catch(() => null);
      const text = fallback?.text || getFallbackResponse(prompt);
      return res.json({ success: true, data: { response: text, mode: 'fallback' } });
    }

    // ── Step 2: Fusion – select best response ──
    const scored = successful.map(r => {
      const score = (r.text?.length || 0) + (r.text?.includes('```') ? 50 : 0);
      return { ...r, score };
    });
    const best = scored.reduce((a, b) => a.score > b.score ? a : b);

    // ── Step 3: Reflection (optional enhancement) ──
    let finalText = best.text;
    try {
      const critiquePrompt = `
        You are the ChangeX AI Tutor Refiner. A student asked: "${prompt}"
        An AI generated this response: 
        ---
        ${best.text.substring(0, 1500)}...
        ---
        Please:
        1. Correct any factual errors.
        2. Add one missing key insight.
        3. Make it more actionable and encouraging.
        Return only the improved version, no explanations.
      `;
      const refined = await callOpenRouter(critiquePrompt, MODELS.fast);
      if (refined?.text) finalText = refined.text;
    } catch (err) {
      console.warn('Reflection step failed, using best response.');
    }

    // ── Step 4: Enrich with ChangeX context ──
    finalText = enrichResponse(finalText, prompt);

    res.json({
      success: true,
      data: {
        response: finalText,
        ensemble: {
          modelsUsed: successful.map(r => r.model),
          primaryModel: best.model,
          reflectionApplied: finalText !== best.text,
        }
      }
    });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ success: false, message: 'AI service temporarily unavailable.' });
  }
};

// ─── OPENROUTER CALL ────────────────────────────────────────────
async function callOpenRouter(
  prompt: string,
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
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
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

// ─── ENRICHMENT ───────────────────────────────────────────────────
function enrichResponse(content: string, prompt: string): string {
  let enriched = content;

  // Add course suggestion if relevant
  const courseKeywords = ['html', 'css', 'javascript', 'react', 'freelancing', 'coding'];
  const hasCourseTopic = courseKeywords.some(k => prompt.toLowerCase().includes(k));
  if (hasCourseTopic && !content.includes('ChangeX')) {
    enriched += `\n\n💡 Want to dive deeper? Check out our **${prompt.substring(0, 30)}...** course on ChangeX Academy! 🚀`;
  }

  // Add random motivational tip (1/4 chance)
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

// ─── FALLBACK RESPONSES ─────────────────────────────────────────
function getFallbackResponse(prompt: string): string {
  const fallbacks = [
    "Hey! 🎯 That's a great question. While I'm thinking, here's a quick tip: **Break big problems into small chunks**. What part are you stuck on?",
    "I'm currently processing your request. Meanwhile, remember: **The best way to learn is to build something you're passionate about**. What's your dream project?",
    "Interesting question! 🤔 If I were you, I'd start by writing down 3 things you already know about this topic. Then, identify 1 thing you need to learn. You've got this!",
    "I'm here to help you crush this! 💪 Can you tell me a bit more about what you're trying to achieve? That way I can give you the best advice.",
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ─── FILE UPLOAD ───────────────────────────────────────────────────
export const uploadFileForAnalysis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as IUser;
    const isPremium = user?.isPremium || false;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Free users: limit to 1MB
    if (!isPremium && req.file.size > 1024 * 1024) {
      return res.status(403).json({
        success: false,
        message: 'Free users can only upload files up to 1MB. Upgrade to Premium for unlimited uploads!'
      });
    }

    const filename = req.file.originalname;
    const fileBuffer = req.file.buffer;

    // Extract text (simplified – you can add PDF parsing)
    let content = fileBuffer.toString('utf-8').substring(0, 500);

    // Use AI to analyse with ensemble (same as chat)
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
      const result = await callOpenRouter(analysisPrompt, MODELS.balanced);
      analysis = result.text;
    } catch (err) {
      analysis = `📄 I've received your file "${filename}". Ask me specific questions about it in the chat!`;
    }

    res.json({
      success: true,
      data: {
        filename,
        fileSize: req.file.size,
        analysis,
        premiumNote: !isPremium ? '💡 Upgrade to Premium for unlimited file uploads and advanced analysis.' : undefined,
      }
    });
  } catch (err) {
    console.error('AI file analysis error:', err);
    res.status(500).json({ success: false, message: 'File analysis failed.' });
  }
};
