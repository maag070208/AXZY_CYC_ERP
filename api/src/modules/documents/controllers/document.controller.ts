import { Request, Response } from "express";
import { HttpError } from "@core/middlewares/error.middleware";
import { DocumentUploadFieldsDto, DocumentValidateDto } from "../models/dto/document.dto";
import type { DocumentService } from "../services/document.service";
import type { KardexService } from "../services/kardex.service";

export class DocumentController {
  constructor(
    private readonly documents: DocumentService,
    private readonly kardex: KardexService
  ) {}

  private actor(req: Request) {
    if (!req.user) throw new HttpError(401, "UNAUTHENTICATED");
    return req.user;
  }

  list = async (req: Request, res: Response) => {
    res.json(await this.documents.list(req.params.studentId, this.actor(req)));
  };

  upload = async (req: Request, res: Response) => {
    const fields = DocumentUploadFieldsDto.parse(req.body ?? {});
    res.status(201).json(await this.documents.upload(req.params.studentId, req.file, fields, this.actor(req)));
  };

  download = async (req: Request, res: Response) => {
    const file = await this.documents.download(req.params.id, this.actor(req));
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Length", String(file.buffer.length));
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(file.buffer);
  };

  validate = async (req: Request, res: Response) => {
    const { status, notes } = DocumentValidateDto.parse(req.body);
    res.json(await this.documents.validate(req.params.id, status, notes, this.actor(req)));
  };

  remove = async (req: Request, res: Response) => {
    await this.documents.remove(req.params.id, this.actor(req));
    res.status(204).send();
  };

  getKardex = async (req: Request, res: Response) => {
    res.json(await this.kardex.get(req.params.studentId, this.actor(req)));
  };
}
