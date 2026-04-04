
# ChangeX Academy Backend

Production-ready backend for ChangeX Academy - an ed-tech platform combining courses, marketplace, job board, social network, and learn-to-earn features.

## Features

- 🔐 Authentication (JWT with refresh token rotation, 2FA, email verification)
- 💰 Payments (Stripe, Paystack, wallet system, automated payouts)
- 📚 Courses (Video lessons, quizzes, certificates, progress tracking)
- 🏪 Marketplace (Digital & physical products, order management)
- 💼 Job Board (Job postings, applications, employer dashboards)
- 👥 Social Network (Posts, comments, likes, notifications)
- 🎮 Gamification (XP, levels, streaks, badges, leaderboards)
- 🤖 AI Integration (OpenAI & Gemini for chat, recommendations, code debugging)
- 📊 Analytics (Real-time metrics, user behaviour, revenue tracking)
- 🔄 Real-time (Socket.io for notifications and chat)
- 📧 Email (Nodemailer with templates)
- 🚀 Scalable (Redis caching, Bull queues, MongoDB replica sets)

## Tech Stack

- Node.js 20+, Express.js, TypeScript, MongoDB, Redis, Bull, Socket.io, Stripe, Paystack, OpenAI, Gemini, AWS S3, Cloudinary, Docker

## Installation

```bash
cp .env.example .env
npm install
docker-compose up -d mongodb-primary mongodb-secondary mongodb-arbiter redis
docker exec mongodb-primary mongosh --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'mongodb-primary:27017'}, {_id: 1, host: 'mongodb-secondary:27018'}, {_id: 2, host: 'mongodb-arbiter:27019', arbiterOnly: true}]})"
npm run seed
npm run dev
