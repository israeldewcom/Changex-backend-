// ============================================================
// FILE: src/services/pdfGenerator.ts (COMPLETE REDESIGN)
// ============================================================

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CertificateOptions {
  userName: string;
  programTitle: string;
  topics?: string[];
  programType?: string;
  duration?: string;
  level?: string;
  issuer?: string;
  completionDate: Date;
  instructorName?: string;
  backgroundImageUrl?: string;
  userEmail?: string;
}

export async function generateCertificatePDF(
  options: CertificateOptions
): Promise<Buffer> {
  const {
    userName,
    programTitle,
    topics = [],
    programType = 'Online Learning Program',
    duration = 'Self‑Paced',
    level = 'Intermediate',
    issuer = 'ChangeX Academy',
    completionDate,
    instructorName,
    backgroundImageUrl,
    userEmail,
  } = options;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        layout: 'landscape',
        size: 'A4',
        margin: 0,
        autoFirstPage: false,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.addPage();
      const { width, height } = doc.page;

      // ─── BACKGROUND ──────────────────────────────────────────────
      // If a background image is provided, draw it; otherwise, use a clean white background.
      if (backgroundImageUrl) {
        // Attempt to load image (ensure it's a valid URL or path)
        try {
          doc.image(backgroundImageUrl, 0, 0, { width, height });
        } catch (err) {
          // Fallback to white background
          doc.rect(0, 0, width, height).fill('#FFFFFF');
        }
      } else {
        // White background with subtle gold gradient overlay
        doc.rect(0, 0, width, height).fill('#FDF8F0'); // off‑white like old parchment
        // Add a subtle gradient overlay (light gold to white)
        const grad = doc.linearGradient(0, 0, 0, height);
        grad.stop(0, '#FDF8F0', 0.3);
        grad.stop(1, '#FFFFFF', 1);
        doc.rect(0, 0, width, height).fill(grad);
      }

      // ─── DECORATIVE BORDER ──────────────────────────────────────
      const margin = 40;
      const borderWidth = 2;
      const innerBorderMargin = 30;

      // Outer border (thick gold)
      doc.save()
        .rect(margin, margin, width - 2 * margin, height - 2 * margin)
        .lineWidth(3)
        .strokeColor('#D4AF37')
        .stroke();

      // Inner border (thinner)
      doc.save()
        .rect(margin + innerBorderMargin, margin + innerBorderMargin, 
              width - 2 * (margin + innerBorderMargin), 
              height - 2 * (margin + innerBorderMargin))
        .lineWidth(1.5)
        .strokeColor('#B8860B')
        .stroke();

      // Decorative corner ornaments
      const cornerSize = 30;
      const cornerOffset = margin + 10;
      const cornerColor = '#D4AF37';

      const drawCorner = (x: number, y: number, angle: number) => {
        doc.save();
        doc.translate(x, y);
        doc.rotate(angle);
        // Draw an L‑shape
        doc.lineWidth(2)
          .strokeColor(cornerColor)
          .moveTo(0, cornerSize)
          .lineTo(0, 0)
          .lineTo(cornerSize, 0)
          .stroke();
        doc.restore();
      };

      drawCorner(margin + 10, margin + 10, 0);
      drawCorner(width - margin - 10, margin + 10, 90);
      drawCorner(margin + 10, height - margin - 10, -90);
      drawCorner(width - margin - 10, height - margin - 10, 180);

      // ─── CONTENT AREA ────────────────────────────────────────────
      const contentX = margin + 40;
      const contentY = margin + 50;
      const contentWidth = width - 2 * (margin + 40);
      const contentHeight = height - 2 * (margin + 50);

      // ─── TITLE ──────────────────────────────────────────────────
      doc.fontSize(34)
        .font('Helvetica-Bold')
        .fillColor('#1F2937')
        .text('CERTIFICATE', contentX, contentY, { align: 'center', width: contentWidth });
      doc.fontSize(28)
        .fillColor('#D4AF37')
        .text('OF COMPLETION', { align: 'center' });

      // Decorative line under title
      const lineWidth = 200;
      const lineY = doc.y + 10;
      doc.moveTo((width - lineWidth) / 2, lineY)
        .lineTo((width + lineWidth) / 2, lineY)
        .lineWidth(2)
        .strokeColor('#D4AF37')
        .stroke();

      doc.moveDown(1.5);

      // ─── PRESENTED TO ───────────────────────────────────────────
      doc.fontSize(14)
        .font('Helvetica')
        .fillColor('#4B5563')
        .text('This certificate is proudly presented to', { align: 'center' });

      doc.moveDown(0.5);

      // ─── RECIPIENT NAME ──────────────────────────────────────────
      doc.fontSize(32)
        .font('Helvetica-Bold')
        .fillColor('#7C3AED')  // Purple for the name
        .text(userName, { align: 'center' });

      doc.moveDown(0.5);

      // ─── COMPLETION STATEMENT ──────────────────────────────────
      doc.fontSize(14)
        .font('Helvetica')
        .fillColor('#4B5563')
        .text(`has successfully completed the program`, { align: 'center' });

      doc.moveDown(0.3);

      // ─── PROGRAM TITLE ──────────────────────────────────────────
      doc.fontSize(22)
        .font('Helvetica-Bold')
        .fillColor('#06B6D4')  // Cyan/Teal
        .text(programTitle, { align: 'center' });

      doc.moveDown(0.5);

      // ─── TOPICS (BULLET LIST) ──────────────────────────────────
      if (topics && topics.length > 0) {
        doc.fontSize(11)
          .font('Helvetica')
          .fillColor('#374151');

        const maxBulletWidth = contentWidth - 60; // indentation
        const bulletSpacing = 1.5;

        // Indent the bullet list
        const indent = 50;
        doc.moveDown(0.5);
        topics.forEach((topic, index) => {
          const bullet = '•';
          const text = topic;
          const yPos = doc.y;
          doc.text(bullet, contentX + indent, yPos, { continued: false });
          doc.text(text, contentX + indent + 20, yPos, {
            width: maxBulletWidth - 20,
            lineBreak: true,
            align: 'left',
            continued: false,
          });
          // Move down after each bullet
          if (index < topics.length - 1) {
            doc.moveDown(0.3);
          }
        });
        doc.moveDown(0.5);
      }

      // ─── PROGRAM DETAILS (type, duration, level) ──────────────
      const detailsY = doc.y + 20;
      const detailStartX = contentX + 40;
      const detailSpacing = contentWidth / 3;

      doc.fontSize(11)
        .font('Helvetica')
        .fillColor('#374151');

      // Program Type
      doc.text(`Program Type: ${programType}`, detailStartX, detailsY, { width: detailSpacing - 20, align: 'left' });
      // Duration
      doc.text(`Duration: ${duration}`, detailStartX + detailSpacing, detailsY, { width: detailSpacing - 20, align: 'center' });
      // Level
      doc.text(`Level: ${level}`, detailStartX + 2 * detailSpacing, detailsY, { width: detailSpacing - 20, align: 'right' });

      // ─── ISSUER / DATE / SIGNATURE ──────────────────────────────
      const signatureY = height - margin - 60;

      // Date
      const formattedDate = completionDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      doc.fontSize(10)
        .fillColor('#6B7280')
        .text(`Date Issued: ${formattedDate}`, contentX, signatureY + 20, { align: 'center', width: contentWidth });

      // Issuer
      doc.fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#1F2937')
        .text(`Issued By: ${issuer}`, { align: 'center' });

      // Signature line (if instructor name provided)
      if (instructorName) {
        const sigX = width / 2 - 80;
        const sigY = signatureY - 10;
        doc.fontSize(10)
          .fillColor('#374151')
          .text('Program Coordinator', width / 2, sigY + 30, { align: 'center' });
        doc.moveTo(width / 2 - 80, sigY + 20)
          .lineTo(width / 2 + 80, sigY + 20)
          .lineWidth(1)
          .strokeColor('#9CA3AF')
          .stroke();
        doc.fontSize(10)
          .fillColor('#6B7280')
          .text(instructorName, width / 2, sigY + 35, { align: 'center' });
      }

      // ─── FOOTER ──────────────────────────────────────────────────
      doc.fontSize(8)
        .fillColor('#9CA3AF')
        .text(`Certificate ID: ${Buffer.from(`${userEmail || 'user'}${programTitle}${completionDate.toISOString()}`)
          .toString('base64')
          .substring(0, 16)
          .toUpperCase()}`, contentX, height - margin - 10, { align: 'left' });

      doc.fontSize(8)
        .fillColor('#9CA3AF')
        .text('ChangeX Academy – Learn to Earn | www.changex.academy', contentX, height - margin - 10, { align: 'right' });

      // ─── SEAL / LOGO ──────────────────────────────────────────────
      // Add a small gold stamp in the lower right (optional)
      const sealX = width - margin - 60;
      const sealY = height - margin - 60;
      doc.circle(sealX, sealY, 30)
        .lineWidth(1.5)
        .strokeColor('#D4AF37')
        .stroke();
      doc.fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#D4AF37')
        .text('CX', sealX - 8, sealY - 5, { align: 'center' });
      doc.fontSize(6)
        .fillColor('#6B7280')
        .text('ChangeX', sealX - 15, sealY + 8, { align: 'center' });
      doc.text('Academy', sealX - 15, sealY + 16, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Also keep a simple version for backward compatibility
export async function generateSimpleCertificatePDF(
  userName: string,
  courseTitle: string,
  completionDate: Date
): Promise<Buffer> {
  return generateCertificatePDF({
    userName,
    programTitle: courseTitle,
    topics: [],
    programType: 'Online Course',
    duration: 'Self‑Paced',
    level: 'Intermediate',
    issuer: 'ChangeX Academy',
    completionDate,
  });
}
