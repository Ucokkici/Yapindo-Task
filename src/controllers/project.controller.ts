import { Response, RequestHandler } from "express";
import { prisma } from "../config/db";
import { AuthRequest } from "../middlewares/auth.middleware";
import { createAuditLog } from "../utils/audit";
import { redisClient } from "../config/redis";

export const createProject: RequestHandler = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        message: "Name dan description wajib diisi",
      });
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        createdBy: req.user!.id,
      },
    });

    await redisClient.del("projects");

    await createAuditLog(
      req.user!.id,
      "CREATE_PROJECT",
      req.body,
      project,
      "SUCCESS",
    );

    return res.status(201).json(project);
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const getProjects: RequestHandler = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const cacheKey = "projects";

    const cached = await redisClient.get(cacheKey);

    if (cached) {
      console.log("Projects from Redis");
      return res.json(JSON.parse(cached));
    }

    const projects = await prisma.project.findMany({
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await redisClient.set(cacheKey, JSON.stringify(projects), {
      EX: 60,
    });

    console.log("Projects from Database");

    return res.json(projects);
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const getProjectById: RequestHandler = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const id = Number(req.params.id);

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    return res.json(project);
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const updateProject = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        message: "Name dan description wajib diisi",
      });
    }

    const existingProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!existingProject) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        name,
        description,
      },
    });

    await redisClient.del("projects");
    await redisClient.del(`project:${id}`);
    await redisClient.del(`tasks:project:${id}`);

    return res.json({
      message: "Project updated successfully",
      data: updatedProject,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export const deleteProject: RequestHandler = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const id = Number(req.params.id);

    const existingProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!existingProject) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    await prisma.project.delete({
      where: { id },
    });

    await redisClient.del("projects");

    return res.json({
      message: "Project deleted successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      message: error.message,
    });
  }
};