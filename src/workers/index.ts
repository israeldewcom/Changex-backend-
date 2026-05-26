// File: src/workers/index.ts
import Bull from 'bull';
import redis from '../config/redis.js';
import logger from '../utils/logger.js';
import { runCertificateWorker } from './certificate.worker.js';
import { runLeaderboardWorker } from './leaderboard.worker.js';
import { runStreakResetWorker } from './streakReset.worker.js';
import { runSubscriptionExpiryWorker } from './subscriptionExpiry.worker.js';

export const queueOptions = {
  redis: {
    host: new URL(process.env.REDIS_URL!).hostname,
    port: Number(new URL(process.env.REDIS_URL!).port),
    password: new URL(process.env.REDIS_URL!).password,
  },
};

export const certificateQueue = new Bull('certificate-gen', queueOptions);
export const leaderboardQueue = new Bull('leaderboard-cache', queueOptions);
export const streakResetQueue = new Bull('streak-reset', queueOptions);
export const subscriptionExpiryQueue = new Bull('subscription-expiry', queueOptions);

export const startWorkers = () => {
  runCertificateWorker(certificateQueue);
  runLeaderboardWorker(leaderboardQueue);
  runStreakResetWorker(streakResetQueue);
  runSubscriptionExpiryWorker(subscriptionExpiryQueue);

  // Schedule recurring jobs
  leaderboardQueue.add({}, { repeat: { every: 3600000 } }); // every hour
  streakResetQueue.add({}, { repeat: { cron: '0 0 * * *' } }); // daily at midnight
  subscriptionExpiryQueue.add({}, { repeat: { cron: '0 0 * * *' } }); // daily at midnight

  logger.info('Workers started');
};
