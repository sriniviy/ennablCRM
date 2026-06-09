import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import type { Request, Response } from "express";

const router = Router();

router.get("/me", requireAuth, (req: Request, res: Response) => {
  const { dbUser } = req as AuthRequest;
  res.json(dbUser);
});

export default router;
