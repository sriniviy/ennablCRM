import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import contactsRouter from "./contacts";
import companiesRouter from "./companies";
import dealStagesRouter from "./deal-stages";
import dealsRouter from "./deals";
import tasksRouter from "./tasks";
import activitiesRouter from "./activities";
import campaignsRouter from "./campaigns";
import dashboardRouter from "./dashboard";
import trackingRouter from "./tracking";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/users", usersRouter);
router.use("/contacts", contactsRouter);
router.use("/companies", companiesRouter);
router.use("/deal-stages", dealStagesRouter);
router.use("/deals", dealsRouter);
router.use("/tasks", tasksRouter);
router.use("/activities", activitiesRouter);
router.use("/campaigns", campaignsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/track", trackingRouter);

export default router;
