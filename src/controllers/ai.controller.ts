import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { generateAIResponse } from "../services/ai.service";
import { prisma } from "../config/db";
import { createAuditLog } from "../utils/audit";
import { Prisma } from "@prisma/client";

// ==========================================
// Helper: Execute query actions (read-only)
// ==========================================
const executeQueryAction = async (action: any) => {
  switch (action.type) {
    case "QUERY_HIGH_PRIORITY_PROJECTS": {
      const tasks = await prisma.task.findMany({
        where: { priority: "HIGH" },
        include: {
          project: {
            select: { id: true, name: true, description: true },
          },
          assignee: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Group tasks by project
      const projectMap: Record<number, any> = {};
      for (const task of tasks) {
        const pId = task.project.id;
        if (!projectMap[pId]) {
          projectMap[pId] = {
            id: task.project.id,
            name: task.project.name,
            description: task.project.description,
            highPriorityTasks: [],
          };
        }
        projectMap[pId].highPriorityTasks.push({
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          assignee: task.assignee,
        });
      }

      return {
        query: "QUERY_HIGH_PRIORITY_PROJECTS",
        totalProjects: Object.keys(projectMap).length,
        totalHighPriorityTasks: tasks.length,
        projects: Object.values(projectMap),
      };
    }

    case "QUERY_USER_PROJECTS": {
      const { userName, userId } = action.data || {};

      let user: any = null;

      if (userId) {
        user = await prisma.user.findUnique({
          where: { id: Number(userId) },
          select: { id: true, name: true, email: true },
        });
      } else if (userName) {
        user = await prisma.user.findFirst({
          where: {
            name: {
              contains: String(userName),
            },
          },
          select: { id: true, name: true, email: true },
        });
      }

      if (!user) {
        const searchTerm = userId ? `ID ${userId}` : `"${userName}"`;
        throw new Error(`User dengan ${searchTerm} tidak ditemukan.`);
      }

      const tasks = await prisma.task.findMany({
        where: { assigneeId: user.id },
        include: {
          project: {
            select: { id: true, name: true, description: true },
          },
        },
      });

      // Group tasks by project
      const projectMap: Record<number, any> = {};
      for (const task of tasks) {
        const pId = task.project.id;
        if (!projectMap[pId]) {
          projectMap[pId] = {
            id: task.project.id,
            name: task.project.name,
            description: task.project.description,
            tasks: [],
          };
        }
        projectMap[pId].tasks.push({
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
        });
      }

      return {
        query: "QUERY_USER_PROJECTS",
        user,
        totalProjects: Object.keys(projectMap).length,
        totalTasks: tasks.length,
        projects: Object.values(projectMap),
      };
    }

    default:
      throw new Error(`Unknown query type: ${action.type}`);
  }
};

// ==========================================
// Helper: Prompt-level security check
// ==========================================
const MODIFY_KEYWORDS = [
  "hapus",
  "delete",
  "ubah",
  "update",
  "ganti",
  "remove",
  "buang",
  "drop",
  "truncate",
];
const USER_TARGET_KEYWORDS = [
  "user",
  "admin",
  "pengguna",
  "akun",
  "password",
  "role",
];
const QUERY_KEYWORDS = [
  "tampilkan",
  "lihat",
  "cari",
  "project apa",
  "mengerjakan",
  "working on",
  "prioritas",
  "priority",
  "sedang",
];

const isForbiddenPrompt = (prompt: string): boolean => {
  const normalized = prompt.toLowerCase();
  const hasModify = MODIFY_KEYWORDS.some((k) => normalized.includes(k));
  const hasUserTarget = USER_TARGET_KEYWORDS.some((k) =>
    normalized.includes(k),
  );
  const hasQueryIntent = QUERY_KEYWORDS.some((k) => normalized.includes(k));

  // Block if prompt has modify intent + user target, UNLESS it's a query intent
  return hasModify && hasUserTarget && !hasQueryIntent;
};

// ==========================================
// Helper: Check if actions are query-type
// ==========================================
const QUERY_ACTION_TYPES = [
  "QUERY_HIGH_PRIORITY_PROJECTS",
  "QUERY_USER_PROJECTS",
];

const isQueryAction = (actionType: string): boolean => {
  return QUERY_ACTION_TYPES.includes(actionType);
};

// ==========================================
// AI Query Handler (with SSE Stream support)
// ==========================================
export const aiQuery = async (
  req: AuthRequest,
  res: Response,
): Promise<void | Response> => {
  const { prompt } = req.body;
  const useStream = req.query.stream === "true";

  if (!prompt) {
    return res.status(400).json({ message: "Prompt wajib diisi" });
  }

  try {
    // Prompt-level security: detect user modification intent from raw prompt
    if (isForbiddenPrompt(prompt)) {
      await createAuditLog(
        req.user!.id,
        "AI_QUERY_FORBIDDEN",
        { prompt },
        {},
        "failed",
        "Security block: Prompt targets user/admin table.",
      );
      return res.status(400).json({
        message:
          "Forbidden operation detected: Perubahan data User/Admin dilarang keras oleh kebijakan AI.",
      });
    }

    const aiResult = await generateAIResponse(prompt);

    if (aiResult.error === "AI_FAILED") {
      const safeReason = String(
        aiResult.details || "AI Parsing Failed",
      ).substring(0, 190);
      await createAuditLog(
        req.user!.id,
        "AI_QUERY_FAILED",
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

    // Security check: block forbidden operations
    const forbiddenKeywords = ["USER", "ADMIN", "AUTH", "ROLE", "PASSWORD"];
    for (const action of actions) {
      const actionTypeUpper = (action.type || "").toUpperCase();
      // Allow QUERY_USER_PROJECTS (read-only), block modification actions containing forbidden keywords
      if (
        actionTypeUpper !== "QUERY_USER_PROJECTS" &&
        forbiddenKeywords.some((f) => actionTypeUpper.includes(f))
      ) {
        await createAuditLog(
          req.user!.id,
          "AI_QUERY_FORBIDDEN",
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

    // Validate that at least one action is a query type
    const queryActions = actions.filter((a: any) => isQueryAction(a.type));
    if (queryActions.length === 0) {
      await createAuditLog(
        req.user!.id,
        "AI_QUERY_FAILED",
        { prompt },
        aiResult,
        "failed",
        "No query action detected from prompt.",
      );
      return res.status(400).json({
        message:
          "Prompt tidak menghasilkan query yang valid. Gunakan endpoint /ai/command untuk perintah eksekusi.",
      });
    }

    // === SSE Stream Response ===
    if (useStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      for (const action of queryActions) {
        try {
          // Send query start event
          res.write(
            `data: ${JSON.stringify({ type: "query_start", query: action.type })}\n\n`,
          );

          const result = await executeQueryAction(action);

          // Stream each project individually
          if (result.projects && Array.isArray(result.projects)) {
            for (const project of result.projects) {
              res.write(
                `data: ${JSON.stringify({ type: "project", data: project })}\n\n`,
              );
            }
          }

          // Send query end event with summary
          res.write(
            `data: ${JSON.stringify({
              type: "query_end",
              query: result.query,
              totalProjects: result.totalProjects,
              ...(result.totalHighPriorityTasks !== undefined
                ? { totalHighPriorityTasks: result.totalHighPriorityTasks }
                : {}),
              ...(result.totalTasks !== undefined
                ? { totalTasks: result.totalTasks }
                : {}),
              ...(result.user ? { user: result.user } : {}),
            })}\n\n`,
          );
        } catch (queryError: any) {
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              query: action.type,
              message: queryError.message,
            })}\n\n`,
          );
        }
      }

      // Send stream done event
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();

      await createAuditLog(
        req.user!.id,
        "AI_QUERY_STREAM",
        { prompt },
        { actions: queryActions.map((a: any) => a.type) },
        "success",
      );

      return;
    }

    // === Regular JSON Response ===
    const results = [];
    for (const action of queryActions) {
      const result = await executeQueryAction(action);
      results.push(result);
    }

    await createAuditLog(
      req.user!.id,
      "AI_QUERY",
      { prompt },
      { actions: queryActions.map((a: any) => a.type), results },
      "success",
    );

    return res.json({
      message: "AI query executed successfully",
      data: results.length === 1 ? results[0] : results,
    });
  } catch (error: any) {
    console.error("🔥 AI QUERY ERROR:", error.message);

    const safeErrorReason = String(error.message || "Query Error").substring(
      0,
      190,
    );

    await createAuditLog(
      req.user!.id,
      "AI_QUERY_FAILED",
      { prompt },
      {},
      "failed",
      safeErrorReason,
    );

    return res.status(400).json({
      message: "Query gagal dijalankan.",
      error: error.message,
    });
  }
};

// ==========================================
// AI Command Handler (existing + query redirect)
// ==========================================
export const aiCommand = async (
  req: AuthRequest,
  res: Response,
): Promise<void | Response> => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ message: "Prompt wajib diisi" });
  }

  try {
    // Prompt-level security: detect user modification intent from raw prompt
    if (isForbiddenPrompt(prompt)) {
      await createAuditLog(
        req.user!.id,
        "AI_COMMAND_FORBIDDEN",
        { prompt },
        {},
        "failed",
        "Security block: Prompt targets user/admin table.",
      );
      return res.status(400).json({
        message:
          "Forbidden operation detected: Perubahan data User/Admin dilarang keras oleh kebijakan AI.",
      });
    }

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

    // Security check: block forbidden operations (allow QUERY_USER_PROJECTS as read-only)
    const forbiddenKeywords = ["USER", "ADMIN", "AUTH", "ROLE", "PASSWORD"];
    for (const action of actions) {
      const actionTypeUpper = (action.type || "").toUpperCase();
      if (
        actionTypeUpper !== "QUERY_USER_PROJECTS" &&
        forbiddenKeywords.some((f) => actionTypeUpper.includes(f))
      ) {
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

    // Check if any actions are query-type → redirect to query logic
    const queryActions = actions.filter((a: any) => isQueryAction(a.type));
    const commandActions = actions.filter((a: any) => !isQueryAction(a.type));

    // Execute query actions if present
    const queryResults = [];
    for (const action of queryActions) {
      const result = await executeQueryAction(action);
      queryResults.push(result);
    }

    // Execute command actions in transaction (if any)
    let transactionResult: any[] = [];
    if (commandActions.length > 0) {
      transactionResult = await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const results = [];

          for (const action of commandActions) {
            switch (action.type) {
              case "CREATE_TASK": {
                let projectId = Number(action.data.projectId);
                let assigneeId = Number(action.data.assigneeId);

                // Check project availability, dynamic fallback to first project if not specified or not found
                let projectExists = null;
                if (projectId) {
                  projectExists = await tx.project.findUnique({
                    where: { id: projectId },
                  });
                }

                if (!projectExists) {
                  // Fallback: Get first available project
                  const firstProject = await tx.project.findFirst({
                    orderBy: { id: "asc" },
                  });
                  if (!firstProject) {
                    throw new Error(
                      "Tidak ada project yang tersedia di database. Silakan buat project terlebih dahulu.",
                    );
                  }
                  projectId = firstProject.id;
                  projectExists = firstProject;
                }

                // Check assignee user availability, dynamic fallback to current authenticated user
                let userExists = null;
                if (assigneeId) {
                  userExists = await tx.user.findUnique({
                    where: { id: assigneeId },
                  });
                }

                if (!userExists) {
                  assigneeId = req.user!.id;
                  userExists = await tx.user.findUnique({
                    where: { id: assigneeId },
                  });
                }

                if (!userExists) {
                  throw new Error(
                    `User Assignee dengan ID ${assigneeId} tidak ditemukan.`,
                  );
                }

                const rawDescription =
                  action.data.description ||
                  `Diinisiasi via AI Command: "${prompt}"`;
                const safeDescription = String(rawDescription).substring(
                  0,
                  190,
                );

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
    }

    await createAuditLog(
      req.user!.id,
      "AI_COMMAND",
      { prompt },
      { actions, transactionResult, queryResults },
      "success",
    );

    return res.json({
      message: "AI executed successfully",
      data: {
        ...(transactionResult.length > 0
          ? { commandResults: transactionResult }
          : {}),
        ...(queryResults.length > 0 ? { queryResults } : {}),
      },
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
