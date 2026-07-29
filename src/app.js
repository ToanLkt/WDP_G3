const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");

const swaggerSpec = require("./config/swagger");
const { getAllowedFrontendOrigins } = require("./config/frontend");
const authRoutes = require("./routes/auth.routes");
const profileRoutes = require("./routes/profile.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const notificationRoutes = require("./routes/notification.routes");
const githubRoutes = require("./routes/github.routes");
const repositoryRoutes = require("./routes/repository.routes");
const analysisRoutes = require("./routes/analysis.routes");
const snapshotRoutes = require("./routes/snapshot.routes");
const aiFeedbackRoutes = require("./routes/aiFeedback.routes");
const aiRoutes = require("./routes/ai.routes");
const chatRoutes = require("./routes/chat.routes");
const roadmapRoutes = require("./routes/roadmap.routes");
const learningRoutes = require("./routes/learning.routes");
const progressRoutes = require("./routes/progress.routes");
const adminRoutes = require("./routes/admin.routes");
const reportRoutes = require("./routes/report.routes");
const skillRoutes = require("./routes/skill.routes");
const roleRoutes = require("./routes/role.routes");

const errorMiddleware = require("./middlewares/error.middleware");
const { errorResponse } = require("./utils/response");
const { getDev2VecServiceHealth } = require('./services/dev2vec/dev2vec.service');
const mongoose = require('mongoose');

const app = express();
const crypto = require('crypto');
app.use((req, res, next) => {
  req.requestId = String(req.headers['x-request-id'] || crypto.randomUUID()).slice(0, 120);
  res.setHeader('X-Request-Id', req.requestId);
  res.setHeader('X-App-Version', process.env.APP_VERSION || '1.0.0');
  res.setHeader('X-App-Commit', process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'unknown');
  next();
});

const allowedOrigins = [
  ...getAllowedFrontendOrigins(),
  process.env.API_BASE_URL,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5000",
  "http://localhost:8081",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Career Roadmap API is running",
    data: {
      swagger: "/api/swagger",
      health: "/health",
    },
  });
});

const healthHandler = async (req, res) => {
  const python = await getDev2VecServiceHealth();
  const required = Boolean(process.env.DEV2VEC_SERVICE_URL);
  const mongoReady = mongoose.connection.readyState === 1;
  const healthy = (!required || python.healthy) && mongoReady;
  return res.status(healthy ? 200 : 503).json({
    success: true,
    message: "Server is running",
    data: {
      status: healthy ? "ok" : "degraded",
      ready: healthy,
      mongoReady,
      environment: process.env.NODE_ENV || "development",
      dev2vecService: python,
      dev2vec: {
        enabled: String(process.env.DEV2VEC_ENABLED || 'true').toLowerCase() !== 'false',
        modelVersion: require('../ml_service/artifacts/model_metadata.json').modelVersion || null,
        pipelineVersion: require('./services/dev2vec/dev2vecPipelineMetadata.service').ANALYSIS_PIPELINE_VERSION,
        transportMode: process.env.DEV2VEC_SERVICE_URL ? 'http_worker' : 'process',
        artifactStatus: python.healthy ? 'ready' : (required ? 'unavailable' : 'local_process'),
      },
    },
  });
};

app.get("/live", (req, res) => res.status(200).json({ success: true, data: { status: "alive" } }));
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/github", githubRoutes);
app.use("/api/repositories", repositoryRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/snapshots", snapshotRoutes);
app.use("/api/ai-feedback", aiFeedbackRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/roadmaps", roadmapRoutes);
app.use("/api/learning", learningRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/skills", skillRoutes);
app.use("/api/roles", roleRoutes);
app.use(
  "/api/swagger",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
      operationsSorter: "alpha",
      tagsSorter: "alpha",
    },
  }),
);

app.use((req, res) => {
  return errorResponse(res, "Route not found", 404, []);
});

app.use(errorMiddleware);

module.exports = app;
