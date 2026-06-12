import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateCertificatePDF(
  userName: string,
  courseTitle: string,
  completionDate: Date,
  backgroundImageUrl?: string,
  instructorName?: string,
  userEmail?: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Create PDF document in landscape A4
      const doc = new PDFDocument({
        layout: 'landscape',
        size: 'A4',
        margin: 0,
        autoFirstPage: false
      });

      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Add first page
      doc.addPage();

      // Get page dimensions
      const { width, height } = doc.page;

      // Draw decorative border
      doc.save();
      doc.rect(20, 20, width - 40, height - 40);
      doc.lineWidth(4);
      doc.strokeColor('#7C3AED');
      doc.stroke();

      // Inner border
      doc.rect(30, 30, width - 60, height - 60);
      doc.lineWidth(1.5);
      doc.strokeColor('#8B5CF6');
      doc.stroke();

      // Decorative corners
      const cornerSize = 40;
      // Top-left
      doc.lineWidth(3);
      doc.strokeColor('#7C3AED');
      doc.moveTo(20, 20 + cornerSize).lineTo(20, 20).lineTo(20 + cornerSize, 20).stroke();
      // Top-right
      doc.moveTo(width - 20, 20 + cornerSize).lineTo(width - 20, 20).lineTo(width - 20 - cornerSize, 20).stroke();
      // Bottom-left
      doc.moveTo(20, height - 20 - cornerSize).lineTo(20, height - 20).lineTo(20 + cornerSize, height - 20).stroke();
      // Bottom-right
      doc.moveTo(width - 20, height - 20 - cornerSize).lineTo(width - 20, height - 20).lineTo(width - 20 - cornerSize, height - 20).stroke();

      // Add a subtle background pattern (small dots)
      for (let i = 0; i < 200; i++) {
        doc.circle(50 + Math.random() * (width - 100), 50 + Math.random() * (height - 100), 1)
          .fillOpacity(0.1)
          .fill('#7C3AED');
      }
      doc.fillOpacity(1);

      // Certificate title with gradient effect
      doc.fontSize(42);
      doc.font('Helvetica-Bold');
      doc.fillColor('#1F2937');
      doc.text('CERTIFICATE', 0, 100, { align: 'center' });
      doc.text('OF COMPLETION', 0, 150, { align: 'center' });

      // Decorative line under title
      const lineWidth = 200;
      doc.moveTo((width - lineWidth) / 2, 180)
        .lineTo((width + lineWidth) / 2, 180)
        .lineWidth(3)
        .strokeColor('#7C3AED')
        .stroke();

      // Present text
      doc.fontSize(16);
      doc.font('Helvetica');
      doc.fillColor('#4B5563');
      doc.text('This certificate is proudly presented to', 0, 220, { align: 'center' });

      // User name
      doc.fontSize(32);
      doc.font('Helvetica-Bold');
      doc.fillColor('#7C3AED');
      doc.text(userName, 0, 260, { align: 'center' });

      // Completion text
      doc.fontSize(16);
      doc.font('Helvetica');
      doc.fillColor('#4B5563');
      doc.text('for successfully completing the course', 0, 330, { align: 'center' });

      // Course title
      doc.fontSize(24);
      doc.font('Helvetica-Bold');
      doc.fillColor('#06B6D4');
      doc.text(courseTitle, 0, 370, { align: 'center' });

      // Date
      const formattedDate = completionDate.toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      doc.fontSize(12);
      doc.font('Helvetica');
      doc.fillColor('#6B7280');
      doc.text(`Date: ${formattedDate}`, 0, 440, { align: 'center' });

      // Instructor signature line
      if (instructorName && instructorName !== 'ChangeX Academy') {
        doc.fontSize(11);
        doc.fillColor('#374151');
        doc.text('Instructor', width - 200, height - 80, { align: 'center' });
        doc.moveTo(width - 250, height - 70)
          .lineTo(width - 90, height - 70)
          .lineWidth(1)
          .strokeColor('#9CA3AF')
          .stroke();
        doc.fontSize(10);
        doc.fillColor('#6B7280');
        doc.text(instructorName, width - 200, height - 60, { align: 'center' });
      }

      // Academy seal / logo area
      doc.circle(width - 100, 120, 35);
      doc.lineWidth(2);
      doc.strokeColor('#7C3AED');
      doc.stroke();
      doc.fontSize(12);
      doc.font('Helvetica-Bold');
      doc.fillColor('#7C3AED');
      doc.text('CX', width - 100, 110, { align: 'center' });
      doc.fontSize(8);
      doc.fillColor('#6B7280');
      doc.text('ChangeX', width - 100, 130, { align: 'center' });
      doc.text('Academy', width - 100, 140, { align: 'center' });

      // Certificate ID (hash of user email + course + date)
      const certId = Buffer.from(`${userEmail || 'user'}${courseTitle}${completionDate.toISOString()}`)
        .toString('base64')
        .substring(0, 16)
        .toUpperCase();
      
      doc.fontSize(8);
      doc.fillColor('#9CA3AF');
      doc.text(`Cert ID: ${certId}`, 50, height - 40);
      doc.text(`Issue Date: ${formattedDate}`, 50, height - 30);

      // Footer
      doc.fontSize(9);
      doc.fillColor('#9CA3AF');
      doc.text('ChangeX Academy – Learn to Earn | www.changex.academy', 0, height - 30, { align: 'center' });

      doc.restore();
      doc.end();

    } catch (err) {
      reject(err);
    }
  });
}

// Alternative simpler version if PDFKit has issues
export async function generateSimpleCertificatePDF(
  userName: string,
  courseTitle: string,
  completionDate: Date
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Simple border
      doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke();

      // Title
      doc.fontSize(28).font('Helvetica-Bold')
        .text('CERTIFICATE OF COMPLETION', 0, 80, { align: 'center' });

      doc.moveDown(2);
      doc.fontSize(14).font('Helvetica')
        .text('This certificate is awarded to', { align: 'center' });

      doc.moveDown(1);
      doc.fontSize(22).font('Helvetica-Bold')
        .fillColor('#7C3AED')
        .text(userName, { align: 'center' });

      doc.fillColor('#000000');
      doc.moveDown(1);
      doc.fontSize(14).font('Helvetica')
        .text('for successfully completing', { align: 'center' });

      doc.moveDown(1);
      doc.fontSize(18).font('Helvetica-Bold')
        .fillColor('#06B6D4')
        .text(courseTitle, { align: 'center' });

      doc.fillColor('#000000');
      doc.moveDown(2);
      const formattedDate = completionDate.toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      doc.fontSize(12).font('Helvetica')
        .text(`Date: ${formattedDate}`, { align: 'center' });

      doc.moveDown(1);
      doc.fontSize(10).font('Helvetica-Oblique')
        .text('ChangeX Academy – Learn to Earn', { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
