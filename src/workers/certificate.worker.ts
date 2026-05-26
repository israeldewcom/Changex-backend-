// File: src/workers/
import Bull from 'bull';
import { generateCertificate } from '../services/pdfGenerator.js';
import Notification from '../models/Notification.js';
import logger from '../utils/logger.js';
import { getIO } from '../socket.js';

export const runCertificateWorker = (queue: Bull.Queue) => {
  queue.process(async (job) => {
    const { userId, userName, courseTitle, completionDate } = job.data;
    try {
      const url = await generateCertificate(userName, courseTitle, new Date(completionDate));
      // Notify user via in-app and socket
      await Notification.create({
        userId,
        title: 'Certificate Ready',
        message: `Your certificate for ${courseTitle} is ready!`,
        data: { url },
        type: 'course',
      });
      const io = getIO();
      io.to(`user:${userId}`).emit('certificate_ready', { url, courseTitle });
      logger.info(`Certificate generated for user ${userId}`);
    } catch (err) {
      logger.error(`Certificate generation failed for user ${userId}:`, err);
      throw err;
    }
  });
};
