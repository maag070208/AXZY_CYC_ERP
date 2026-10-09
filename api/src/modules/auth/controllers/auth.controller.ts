import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import {
  ChangePasswordInputSchema,
  ForgotPasswordInputSchema,
  LoginInputSchema,
  LogoutInputSchema,
  RefreshInputSchema,
  ResetPasswordInputSchema,
} from "../models/dto/auth.dto";
import { AuthService } from "../services/auth.service";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  login = async (req: Request, res: Response) => {
    const { username, password } = LoginInputSchema.parse(req.body);
    res.json(await this.service.login(username, password));
  };

  refresh = async (req: Request, res: Response) => {
    const { refreshToken } = RefreshInputSchema.parse(req.body);
    res.json(await this.service.refresh(refreshToken));
  };

  me = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    res.json(await this.service.me(req.user.id));
  };

  logout = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    const { refreshToken } = LogoutInputSchema.parse(req.body ?? {});
    await this.service.logout(req.user.id, refreshToken);
    res.status(204).send();
  };

  forgotPassword = async (req: Request, res: Response) => {
    const { username } = ForgotPasswordInputSchema.parse(req.body);
    await this.service.forgotPassword(username);
    res.json({ ok: true });
  };

  resetPassword = async (req: Request, res: Response) => {
    const { token, password } = ResetPasswordInputSchema.parse(req.body);
    await this.service.resetPassword(token, password);
    res.json({ ok: true });
  };

  changePassword = async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    const { currentPassword, newPassword } = ChangePasswordInputSchema.parse(req.body);
    res.json(await this.service.changePassword(req.user.id, currentPassword, newPassword));
  };
}
