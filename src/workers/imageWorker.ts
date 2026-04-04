// ============================================
// FILE: src/workers/imageWorker.ts (new)
// ============================================
import { QueueConfig } from '../config/queue';
import { StorageService } from '../services/StorageService';

const imageQueue = QueueConfig.getInstance().getQueue('image');
if (imageQueue) {
  imageQueue.process(async (job) => {
    const { type, data } = job.data;
    const storageService = StorageService.getInstance();
    if (type === 'optimize') {
      await storageService.optimizeImage(data.path, data.options);
    } else if (type === 'upload') {
      await storageService.uploadImage(data.file, data.path);
    }
  });
}
