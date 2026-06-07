import { Response, Request } from "express";
import { prisma } from "../config/db";
import { AuthRequest } from "../middlewares/auth.middleware";
import { createAuditLog } from "../utils/audit";
import { redisClient } from "../config/redis";

export const createTask = async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, projectId, assigneeId, priority } = req.body;

    if (!title || !projectId || !assigneeId) {
      return res.status(400).json({
        message: "title, projectId, assigneeId wajib diisi",
      });
    }

    const project = await prisma.project.findUnique({
      where: { id: Number(projectId) },
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(assigneeId) },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        projectId: Number(projectId),
        assigneeId: Number(assigneeId),
        priority,
      },
    });

    await redisClient.del("tasks");
    await redisClient.del(`tasks:project:${projectId}`);

    await createAuditLog(
      req.user!.id,
      "CREATE_TASK",
      req.body,
      task,
      "SUCCESS",
    );

    return res.status(201).json(task);
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const getTasks = async (req: Request, res: Response) => {
  try {
    const cacheKey = "tasks";

    const cachedTasks = await redisClient.get(cacheKey);

    if (cachedTasks) {
      console.log("Tasks from Redis");
      return res.json(JSON.parse(cachedTasks));
    }

    const tasks = await prisma.task.findMany({
      include: {
        project: {
          select: { id: true, name: true },
        },
        assignee: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await redisClient.set(cacheKey, JSON.stringify(tasks), {
      EX: 60,
    });

    console.log("Tasks from Database");

    return res.json(tasks);
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const updateTask = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);

    const { title, description, status, priority, assigneeId, projectId } =
      req.body;

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(assigneeId !== undefined && { assigneeId: Number(assigneeId) }),
        ...(projectId !== undefined && { projectId: Number(projectId) }),
      },
    });

    await redisClient.del("tasks");

    await createAuditLog(
      req.user!.id,
      "UPDATE_TASK",
      req.body,
      updatedTask,
      "SUCCESS",
    );

    return res.json(updatedTask);
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const getTaskById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    return res.json(task);
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const getTasksByProject = async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.id);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const cacheKey = `tasks:project:${projectId}`;

    const cached = await redisClient.get(cacheKey);

    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const tasks = await prisma.task.findMany({
      where: {
        projectId,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await redisClient.set(cacheKey, JSON.stringify(tasks), {
      EX: 60,
    });

    return res.json(tasks);
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    await prisma.task.delete({
      where: { id },
    });

    await redisClient.del("tasks");

    await createAuditLog(req.user!.id, "DELETE_TASK", { id }, task, "SUCCESS");

    return res.json({
      message: "Task deleted successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
};
