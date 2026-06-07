import { Router } from "express";
import {
  createTask,
  getTasks,
  updateTask,
  getTaskById,
  getTasksByProject,
  deleteTask,
} from "../controllers/task.controller";

import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";

const router = Router();

router.post("/tasks", authenticate, authorize("ADMIN"), createTask);
router.get("/tasks", authenticate, getTasks);
router.put("/tasks/:id", authenticate, updateTask);
router.get("/tasks/:id", authenticate, getTaskById);
router.get("/projects/:id/tasks", authenticate, getTasksByProject);
router.delete("/tasks/:id", authenticate, authorize("ADMIN"), deleteTask);

export default router;
