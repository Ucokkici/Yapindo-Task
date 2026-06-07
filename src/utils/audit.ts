import { prisma } from "../config/db";

export const createAuditLog = async (
  userId: number,
  action: string,
  requestPayload: any,
  responsePayload: any,
  status: string,
  failedReason?: string
) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        requestPayload,
        responsePayload,
        status,
        failedReason
      }
    });
  } catch (error) {
    console.error("AUDIT LOG ERROR:", error);
  }
};