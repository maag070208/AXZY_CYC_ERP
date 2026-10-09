import { prismaClient } from "@core/config/database";
import { setSystemLanguageReader } from "@core/i18n";
import { filterBool } from "@core/utils/table";
import type { AuditLogger } from "@modules/audit";
import {
  CancellationReasonCreateDto,
  CancellationReasonSchema,
  CancellationReasonTableResponseSchema,
  CancellationReasonUpdateDto,
  DocumentTypeCreateDto,
  DocumentTypeSchema,
  DocumentTypeTableResponseSchema,
  DocumentTypeUpdateDto,
  LevelCreateDto,
  LevelSchema,
  LevelTableResponseSchema,
  LevelUpdateDto,
} from "./models/dto/catalog.dto";
import { CatalogService } from "./services/catalog.service";
import { SettingsService } from "./services/settings.service";
import { TermService } from "./services/term.service";
import { CatalogController, SettingsController, TermController } from "./controllers/config.controller";
import {
  createCatalogRouter,
  createSettingsRouter,
  createTermRouter,
} from "./routes/config.routes";

const LANGUAGE_TTL_MS = 10_000;

export { SettingsService } from "./services/settings.service";
export type { SettingKey } from "./models/dto/settings.dto";

/**
 * M11 — parámetros generales y catálogos base. Devuelve un router por recurso
 * (`/settings`, `/levels`, `/terms`, `/cancellation-reasons`, `/document-types`)
 * y el servicio de parámetros para que otros módulos lean configuración.
 */
export const createConfigModule = (audit?: AuditLogger) => {
  // El idioma del sistema (i18n de la API y de la web) sale de `settings.LANGUAGE`.
  // Se cachea unos segundos (el middleware de idioma lo consulta por petición) y
  // la cache se invalida en cuanto este proceso escribe el parámetro.
  let cached: { value: string | null; at: number } | null = null;
  const settings = new SettingsService(prismaClient, audit, (keys) => {
    if (keys.includes("LANGUAGE")) cached = null;
  });

  setSystemLanguageReader(async () => {
    if (cached && Date.now() - cached.at < LANGUAGE_TTL_MS) return cached.value;
    const value = (await settings.get<string>("LANGUAGE")) ?? null;
    cached = { value, at: Date.now() };
    return value;
  });

  const levels = new CatalogService(
    {
      delegate: (db) => db.level,
      entityType: "Level",
      auditPrefix: "LEVEL",
      extraSort: { sortOrder: "sortOrder" },
      defaultOrder: [{ sortOrder: { sort: "asc", nulls: "last" } }, { name: "asc" }],
    },
    prismaClient,
    audit
  );
  const reasons = new CatalogService(
    {
      delegate: (db) => db.cancellationReason,
      entityType: "CancellationReason",
      auditPrefix: "CANCELLATION_REASON",
      defaultOrder: [{ name: "asc" }],
    },
    prismaClient,
    audit
  );
  const documentTypes = new CatalogService(
    {
      delegate: (db) => db.documentType,
      entityType: "DocumentType",
      auditPrefix: "DOCUMENT_TYPE",
      extraFilters: (filters) => ({ required: filterBool(filters, "required") }),
      extraSort: { required: "required" },
      defaultOrder: [{ name: "asc" }],
    },
    prismaClient,
    audit
  );

  return {
    settingsService: settings,
    routers: {
      settings: createSettingsRouter(new SettingsController(settings)),
      levels: createCatalogRouter(new CatalogController(levels, LevelCreateDto, LevelUpdateDto), {
        path: "levels",
        tag: "Catalogs",
        label: "niveles educativos",
        view: ["levels.view"],
        manage: "levels.manage",
        itemSchema: LevelSchema,
        tableSchema: LevelTableResponseSchema,
        createSchema: LevelCreateDto,
        updateSchema: LevelUpdateDto,
      }),
      terms: createTermRouter(new TermController(new TermService(prismaClient, audit))),
      cancellationReasons: createCatalogRouter(
        new CatalogController(reasons, CancellationReasonCreateDto, CancellationReasonUpdateDto),
        {
          path: "cancellation-reasons",
          tag: "Catalogs",
          label: "motivos de baja",
          // M05 leerá con `students.movements`; hoy basta `config.view`.
          view: ["config.view", "students.movements"],
          manage: "config.manage",
          itemSchema: CancellationReasonSchema,
          tableSchema: CancellationReasonTableResponseSchema,
          createSchema: CancellationReasonCreateDto,
          updateSchema: CancellationReasonUpdateDto,
        }
      ),
      documentTypes: createCatalogRouter(
        new CatalogController(documentTypes, DocumentTypeCreateDto, DocumentTypeUpdateDto),
        {
          path: "document-types",
          tag: "Catalogs",
          label: "tipos de documento",
          // M06 leerá con `documents.view`; hoy basta `config.view`.
          view: ["config.view", "documents.view"],
          manage: "config.manage",
          itemSchema: DocumentTypeSchema,
          tableSchema: DocumentTypeTableResponseSchema,
          createSchema: DocumentTypeCreateDto,
          updateSchema: DocumentTypeUpdateDto,
        }
      ),
    },
  };
};

export default createConfigModule;
