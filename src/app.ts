import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import projectRoutes from "./routes/project.routes";
import taskRoutes from "./routes/task.routes";
import auditRoutes from "./routes/audit.routes";
import { connectRedis } from "./config/redis";
import aiRoutes from "./routes/ai.routes";

dotenv.config();
connectRedis();

const app = express();

app.use(cors());

app.use(express.json());

app.use("/api", authRoutes);
app.use("/api", userRoutes);
app.use("/api", projectRoutes);
app.use("/api", taskRoutes);
app.use("/api", auditRoutes);
app.use("/api", aiRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Yapindo API Running",
  });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
