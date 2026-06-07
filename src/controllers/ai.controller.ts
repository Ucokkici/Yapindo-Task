import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { generateAIResponse } from "../services/ai.service";
import { prisma } from "../config/db";
import { createAuditLog } from "../utils/audit";
import { Prisma } from "@prisma/client";

export const aiCommand = async (
  req: AuthRequest,
  res: Response,
): Promise<void | Response> => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ message: "Prompt wajib diisi" });
  }

  try {
    const aiResult = await generateAIResponse(prompt);

    if (aiResult.error === "AI_FAILED") {
      const safeReason = String(
        aiResult.details || "AI Parsing Failed",
      ).substring(0, 190);
      await createAuditLog(
        req.user!.id,
        "AI_COMMAND_FAILED",
        { prompt },
        aiResult,
        "failed",
        safeReason,
      );
      return res
        .status(400)
        .json({ message: "Format instruksi tidak didukung oleh mesin AI." });
    }

    const actions = aiResult.actions || [];

    const forbiddenKeywords = ["USER", "ADMIN", "AUTH", "ROLE", "PASSWORD"];
    for (const action of actions) {
      const actionTypeUpper = (action.type || "").toUpperCase();
      if (forbiddenKeywords.some((f) => actionTypeUpper.includes(f))) {
        await createAuditLog(
          req.user!.id,
          "AI_COMMAND_FORBIDDEN",
          { prompt },
          aiResult,
          "failed",
          "Security block: Operation on user table.",
        );
        return res.status(400).json({
          message:
            "Forbidden operation detected: Perubahan data User/Admin dilarang keras oleh kebijakan AI.",
        });
      }
    }

    const transactionResult = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const results = [];

        for (const action of actions) {
          switch (action.type) {
            case "CREATE_TASK": {
              const projectId = Number(action.data.projectId) || 1;
              const assigneeId = Number(action.data.assigneeId) || req.user!.id;

              const projectExists = await tx.project.findUnique({
                where: { id: projectId },
              });
              if (!projectExists)
                throw new Error(
                  `Project dengan ID ${projectId} tidak ditemukan.`,
                );

              const userExists = await tx.user.findUnique({
                where: { id: assigneeId },
              });
              if (!userExists)
                throw new Error(
                  `User Assignee dengan ID ${assigneeId} tidak ditemukan.`,
                );

              const rawDescription =
                action.data.description ||
                `Diinisiasi via AI Command: "${prompt}"`;
              const safeDescription = String(rawDescription).substring(0, 190);

              const newTask = await tx.task.create({
                data: {
                  title: action.data.title || "Tugas Otomatis AI",
                  description: safeDescription,
                  status: (action.data.status || "TODO").toUpperCase(),
                  priority: (action.data.priority || "MEDIUM").toUpperCase(),
                  projectId: projectId,
                  assigneeId: assigneeId,
                },
              });
              results.push({ action: "CREATE_TASK", record: newTask });
              break;
            }

            case "UPDATE_TASK": {
              const taskId = Number(action.data.taskId);

              const taskExists = await tx.task.findUnique({
                where: { id: taskId },
              });
              if (!taskExists)
                throw new Error(
                  `Task dengan ID ${taskId} tidak ditemukan untuk diperbarui.`,
                );

              let taskStatus = (action.data.status || "TODO").toUpperCase();
              if (
                taskStatus !== "TODO" &&
                taskStatus !== "IN_PROGRESS" &&
                taskStatus !== "DONE"
              ) {
                taskStatus = "TODO";
              }

              const updatedTask = await tx.task.update({
                where: { id: taskId },
                data: { status: taskStatus },
              });
              results.push({ action: "UPDATE_TASK", record: updatedTask });
              break;
            }

            case "DELETE_TASK": {
              const taskId = Number(action.data.taskId);

              const taskExists = await tx.task.findUnique({
                where: { id: taskId },
              });
              if (!taskExists)
                throw new Error(
                  `Task dengan ID ${taskId} tidak ditemukan untuk dihapus.`,
                );

              const deletedTask = await tx.task.delete({
                where: { id: taskId },
              });
              results.push({ action: "DELETE_TASK", record: deletedTask });
              break;
            }
          }
        }

        return results;
      },
    );

    await createAuditLog(
      req.user!.id,
      "AI_COMMAND",
      { prompt },
      { actions, transactionResult },
      "success",
    );

    return res.json({
      message: "AI executed successfully",
      data: transactionResult,
    });
  } catch (error: any) {
    console.error("🔥 TRANSACTION ROLLBACK:", error.message);

    const safeErrorReason = String(
      error.message || "Transaction Rollback",
    ).substring(0, 190);

    await createAuditLog(
      req.user!.id,
      "AI_COMMAND_FAILED",
      { prompt },
      {},
      "failed",
      safeErrorReason,
    );

    return res.status(400).json({
      message: "Transaksi gagal dan dibatalkan (Rollback dipicu).",
      error: error.message,
    });
  }
};