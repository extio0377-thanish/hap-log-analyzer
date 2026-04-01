import { Router, type IRouter } from "express";
import healthRouter from "./health";
import logsRouter from "./logs";
import screenshotRouter from "./screenshot";
import authRouter from "./auth";
import appConfigRouter from "./app-config";
import usersRouter from "./users";
import rolesRouter from "./roles";
import passwordPolicyRouter from "./password-policy-route";
import profileRouter from "./profile";
import securityRouter from "./security";
import metricsRouter from "./metrics";
import storageRouter from "./storage";
import { requireAuth } from "../lib/auth-middleware";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(appConfigRouter);

router.use(requireAuth);

router.use("/logs", logsRouter);
router.use(screenshotRouter);
router.use("/users", usersRouter);
router.use("/roles", rolesRouter);
router.use("/password-policy", passwordPolicyRouter);
router.use("/profile", profileRouter);
router.use("/security", securityRouter);
router.use("/metrics", metricsRouter);
router.use("/storage", storageRouter);

export default router;
