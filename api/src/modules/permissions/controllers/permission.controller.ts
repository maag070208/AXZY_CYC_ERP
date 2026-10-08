import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import {
  parseCatalogCreateBody,
  parseCatalogUpdateBody,
  parseMatrixBody,
  parseRoleCreateBody,
  parseRoleUpdateBody,
} from "../models/dto/permission.dto";
import { PermissionService } from "../services/permission.service";

export class PermissionController {
  constructor(private readonly svc: PermissionService) {}

  catalog = async (_req: Request, res: Response) => {
    res.json(await this.svc.getActiveCatalog());
  };

  admin = async (_req: Request, res: Response) => {
    res.json(await this.svc.adminData());
  };

  roles = async (_req: Request, res: Response) => {
    res.json(await this.svc.listRoles());
  };

  createRole = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.status(201).json(await this.svc.createRole(parseRoleCreateBody(req.body), req.user.id));
  };

  updateRole = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.json(await this.svc.updateRole(req.params.key, parseRoleUpdateBody(req.body), req.user.id));
  };

  deleteRole = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    await this.svc.deleteRole(req.params.key, req.user.id);
    res.status(204).send();
  };

  createCatalog = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.status(201).json(await this.svc.createCatalog(parseCatalogCreateBody(req.body), req.user.id));
  };

  updateCatalog = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.json(
      await this.svc.updateCatalog(req.params.key, parseCatalogUpdateBody(req.body), req.user.id)
    );
  };

  matrix = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    const { changes } = parseMatrixBody(req.body);
    res.json(await this.svc.saveMatrix(changes, req.user.id));
  };

  reload = async (_req: Request, res: Response) => {
    await this.svc.reload();
    res.json({ ok: true });
  };
}
