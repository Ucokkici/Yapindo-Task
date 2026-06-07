import { Router } from "express";
import { aiCommand } from "../controllers/ai.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.post("/ai/command", authenticate, aiCommand);

export default router;
