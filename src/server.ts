import app from './app';
import { config } from './config';
import { DatabaseConnection } from './config/database';
import { logger } from './utils/logger';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { NotificationService } from './services/NotificationService';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const PORT = config.port;

async function startServer() {
  console.log(`Starting server on port ${PORT}...`);
  try {
    await DatabaseConnection.getInstance().connect();
    console.log('MongoDB connected');

    // DIRECT ADMIN CREATION – bypasses Mongoose validation
    const db = mongoose.connection.db;
    const users = db.collection('users');
    const adminEmail = 'admin@changexacademy.com';
    const adminPassword = 'Admin@123';
    const hashed = await bcrypt.hash(adminPassword, 12);
    
    await users.deleteOne({ email: adminEmail });
    await users.insertOne({
      email: adminEmail,
      password: hashed,
      firstName: 'Admin',
      lastName: 'User',
      displayName: 'Admin User',
      referralCode: 'ADMIN' + Date.now(),
      roles: ['admin', 'creator'],
      isApprovedInstructor: true,
      emailVerified: true,
      isActive: true,
      walletBalance: 100000,
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: new Date(Date.now() + 365*24*60*60*1000),
      xp: 10000,
      level: 10,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log('Admin created: admin@changexacademy.com / Admin@123 (PREMIUM)');

    const httpServer = createServer(app);
    const io = new SocketServer(httpServer, { cors: { origin: true, credentials: true } });
    NotificationService.getInstance().setSocketServer(io);
    
    httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

startServer();
