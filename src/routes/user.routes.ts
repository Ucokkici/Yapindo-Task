import { Router } from "express";
import { profile } from "../controllers/user.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authorize } from "../middlewares/role.middleware";
const router = Router();

router.get(
  "/profile",
  authenticate,
  profile
);

router.get(
  "/admin-only",
  authenticate,
  authorize("ADMIN"),
  (req, res) => {
    res.json({
      message: "Welcome Admin"
    });
  }
);

export default router;