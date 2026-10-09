import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import { parseTableParams, paginatedTable } from "@core/utils/table";
import {
  DeactivateUserDto,
  ResetUserPasswordDto,
  SetUserPermissionsDto,
  UserCreateDto,
  UserUpdateDto,
} from "../models/dto/user.dto";
import { UserService } from "../services/user.service";
import { UserPermissionsService } from "../services/user-permissions.service";

export class UserController {
  constructor(
    private readonly users: UserService,
    private readonly permissions: UserPermissionsService
  ) {}

  list = async (_req: Request, res: Response) => {
    res.json(await this.users.list());
  };

  getById = async (req: Request, res: Response) => {
    res.json(await this.users.getById(req.params.id));
  };

  table = async (req: Request, res: Response) => {
    const params = parseTableParams(req.body);
    const { data, total } = await this.users.table(params);
    res.json(paginatedTable(params, data, total));
  };

  create = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    const input = UserCreateDto.parse(req.body);
    const data = await this.users.create(input, req.user);
    res.status(201).json(data);
  };

  update = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    const input = UserUpdateDto.parse(req.body);
    const data = await this.users.update(req.params.id, input, req.user);
    res.json(data);
  };

  deactivate = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    const { reason } = DeactivateUserDto.parse(req.body ?? {});
    const data = await this.users.deactivate(req.params.id, req.user, reason);
    res.json(data);
  };

  reactivate = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.json(await this.users.reactivate(req.params.id, req.user));
  };

  unlock = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.json(await this.users.unlock(req.params.id, req.user));
  };

  resetPassword = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    const { password } = ResetUserPasswordDto.parse(req.body);
    res.json(await this.users.resetPassword(req.params.id, password, req.user));
  };

  listPermissions = async (req: Request, res: Response) => {
    res.json(await this.permissions.list(req.params.id));
  };

  setPermissions = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    const input = SetUserPermissionsDto.parse(req.body);
    if (input.roles) {
      await this.permissions.setRoles(req.params.id, input.roles, req.user);
    }
    if (input.exception) {
      await this.permissions.setException(req.params.id, input.exception.permission, {
        scope: input.exception.scope,
        reason: input.exception.reason,
        expiresAt: input.exception.expiresAt,
      }, req.user);
    }
    res.json(await this.permissions.list(req.params.id));
  };

  removePermission = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.json(await this.permissions.removeException(req.params.id, req.params.permission, req.user));
  };
}
