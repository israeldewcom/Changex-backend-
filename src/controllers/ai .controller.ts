// File: src/controllers/ai.controller.ts
import { Request, Response, NextFunction } from 'express';
import { chatWithAI } from '../services/ai.js';
import pdfParse from 'pdf-parse';
import fs from 'fs/promises';

export const chat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user!.isPremium) {
      return res.status(403).json({ success: false, message: 'Premium subscription required' });
    }
    const { prompt } = req.body;
    const response = await chatWithAI(prompt, true);
    res.json({ success: true, data: { response } });
  } catch (err) {
    next(err);
  }
};

export const uploadFileForAnalysis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    if (!req.user!.isPremium) return res.status(403).json({ success: false, message: 'Premium subscription required' });

    let extractedText = '';
    if (req.file.mimetype === 'application/pdf') {
      const dataBuffer = await fs.readFile(req.file.path);
      const pdfData = await pdfParse(dataBuffer);
      extractedText = pdfData.text;
    } else if (req.file.mimetype.startsWith('text/')) {
      extractedText = await fs.readFile(req.file.path, 'utf-8');
    } else {
      return res.status(400).json({ success: false, message: 'Only PDF and text files are supported for analysis' });
    }

    // Send to AI with a prompt
    const prompt = `Analyze the following content and provide a summary and key points:\n\n${extractedText.substring(0, 4000)}`;
    const response = await chatWithAI(prompt, true);

    res.json({ success: true, data: { response, extractedLength: extractedText.length } });
  } catch (err) {
    next(err);
  }
};
