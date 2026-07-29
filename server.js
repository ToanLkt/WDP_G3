const dotenv = require('dotenv');
const http = require('http');
const mongoose = require('mongoose');

dotenv.config();

const app = require('./src/app');
const connectDB = require('./src/config/database');
const { initSocket } = require('./src/services/socket.service');

const PORT = process.env.PORT || 5000;
let activeServer = null;
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[shutdown]', { signal });
  const forceTimer = setTimeout(() => process.exit(1), 10000);
  forceTimer.unref();
  if (activeServer) await new Promise((resolve) => activeServer.close(resolve));
  await mongoose.connection.close().catch(() => {});
  clearTimeout(forceTimer);
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const startServer = async () => {
  try {
    await connectDB();
    const server = http.createServer(app);
    activeServer = server;
    initSocket(server);

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      const apiKey = String(process.env.LLM_API_KEY || '');
      console.info('[app_runtime]', {
        appVersion: process.env.APP_VERSION || '1.0.0',
        commitSha: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'unknown',
        nodeEnv: process.env.NODE_ENV || 'development',
        llmProvider: process.env.LLM_PROVIDER || 'gemini',
        llmModel: process.env.LLM_MODEL || 'gemini-2.0-flash',
        fallbackModels: [],
        timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 30000),
        keyLoaded: Boolean(apiKey),
        keySuffix: apiKey ? apiKey.slice(-4) : null,
      });
      console.log(`Swagger UI: ${process.env.API_BASE_URL || `http://localhost:${PORT}`}/api/swagger`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(
          `Port ${PORT} is already in use. Stop the existing server or start this app with a different PORT.`
        );
        console.error(`Example: $env:PORT=5001; npm start`);
        process.exit(1);
      }

      console.error('Failed to start server:', error.message);
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to connect database or start server:', error.message);
    process.exit(1);
  }
};

startServer();
