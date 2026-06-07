import { Response } from "express";
import { prisma } from "../config/db";
import { AuthRequest } from "../middlewares/auth.middleware";

export const profile = async (
  req: AuthRequest,
  res: Response
) => {
  const user = await prisma.user.findUnique({
    where: {
      id: req.user?.id
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  });

  return res.json(user);
  
};