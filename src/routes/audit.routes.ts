import { Router } from "express";

import { getAuditLogs } from "../controllers/audit.controller";

import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";

const router = Router();

router.get("/audit-logs", authenticate, authorize("ADMIN"), getAuditLogs);

export default router;
