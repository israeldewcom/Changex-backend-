import PDFDocument from 'pdfkit';
import { uploadToCloudinary } from './cloudinary.js';
export const generateCertificate = async (userName: string, courseTitle: string, completionDate: Date): Promise<string> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ layout: 'landscape', size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      try {
        const result = await uploadToCloudinary(`data:application/pdf;base64,${buffer.toString('base64')}`, 'certificates', { resource_type: 'auto' });
        resolve(result.secure_url);
      } catch (err) { reject(err); }
    });
    doc.fontSize(30).text('Certificate of Completion', { align: 'center' });
    doc.moveDown(); doc.fontSize(20).text(`This certifies that`, { align: 'center' });
    doc.moveDown(); doc.fontSize(25).text(userName, { align: 'center', bold: true });
    doc.moveDown(); doc.fontSize(20).text(`has successfully completed the course`, { align: 'center' });
    doc.moveDown(); doc.fontSize(25).text(courseTitle, { align: 'center', bold: true });
    doc.moveDown(); doc.fontSize(16).text(`Date: ${completionDate.toLocaleDateString()}`, { align: 'center' });
    doc.end();
  });
};
