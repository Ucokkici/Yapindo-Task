import { Router } from "express";
import { aiCommand, aiQuery } from "../controllers/ai.controller";
import { authenticate } from "../middlewares/auth.middleware";

const router = Router();

router.post("/ai/command", authenticate, aiCommand);
router.post("/ai/query", authenticate, aiQuery);

export default router;

