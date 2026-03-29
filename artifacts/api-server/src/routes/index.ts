import { Router, type IRouter } from "express";
import healthRouter from "./health";
import logsRouter from "./logs";
import screenshotRouter from "./screenshot";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/logs", logsRouter);
router.use(screenshotRouter);

export default router;
