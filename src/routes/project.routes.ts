import { Router } from "express";
import {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
} from "../controllers/project.controller";

import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";

const router = Router();

router.post("/projects", authenticate, authorize("ADMIN"), createProject);
router.get("/projects", authenticate, getProjects);
router.get("/projects/:id", authenticate, getProjectById);
router.put("/projects/:id", authenticate, authorize("ADMIN"), updateProject);
router.delete("/projects/:id", authenticate, authorize("ADMIN"), deleteProject);
export default router;
