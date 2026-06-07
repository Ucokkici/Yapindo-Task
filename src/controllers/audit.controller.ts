import { Request, Response } from "express";
import { prisma } from "../config/db";

export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json(logs);
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
};
