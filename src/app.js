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

const app = express();

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

const healthHandler = (req, res) =>
  res.json({
    success: true,
    message: "Server is running",
    data: {
      status: "ok",
      environment: process.env.NODE_ENV || "development",
    },
  });

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
