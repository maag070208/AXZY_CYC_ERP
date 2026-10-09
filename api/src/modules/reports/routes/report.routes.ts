import { Router } from "express";
import { authenticate, requiresPermission } from "@core/middlewares/auth.middleware";
import { asyncHandler } from "@core/utils/asyncHandler";
import { registerPath } from "@core/swagger/registry";
import { REPORT_TYPES } from "../models/entity/report";
import type { ReportController } from "../controllers/report.controller";

const bearer = [{ bearerAuth: [] }];
const query = (name: string, description: string) => ({
  in: "query" as const, name, required: false, description, schema: { type: "string" as const },
});

export const createReportRouters = (controller: ReportController) => {
  registerPath({
    method: "get", path: "/reports", tags: ["Reports"], security: bearer,
    summary: "Catálogo de reportes disponibles para la persona (reports.view)",
    responses: { 200: { description: "Lista de { type, title, financial }" } },
  });
  registerPath({
    method: "get", path: "/reports/{type}", tags: ["Reports"], security: bearer,
    summary: `Ejecuta un reporte (${REPORT_TYPES.join(" · ")}); exportar requiere reports.export`,
    parameters: [
      { in: "path", name: "type", required: true, schema: { type: "string", enum: [...REPORT_TYPES] } },
      query("format", "json | xlsx | pdf (por defecto json)"),
      query("termId", "Ciclo (por defecto el activo)"),
      query("levelId", "Nivel (indicadores de M21)"),
      query("courseId", "Curso (indicadores de M21)"),
      query("groupId", "Grupo"),
      query("from", "Desde (AAAA-MM-DD)"),
      query("to", "Hasta (AAAA-MM-DD)"),
      query("status", "Estatus (según el reporte)"),
    ],
    responses: {
      200: { description: "{ report, title, generatedAt, filters, columns, rows, totals } o archivo" },
      403: { description: "REPORT_REQUIRES_FULL_SCOPE (reportes con montos) · INSUFFICIENT_PERMISSIONS" },
      404: { description: "REPORT_NOT_FOUND" },
    },
  });
  registerPath({
    method: "get", path: "/dashboard", tags: ["Reports"], security: bearer,
    summary: "KPIs del tablero con el alcance de la persona (reports.view)",
    responses: { 200: { description: "Tablero" } },
  });
  registerPath({
    method: "get", path: "/dashboard/executive", tags: ["Reports"], security: bearer,
    summary:
      "Tablero de Inicio: indicadores del ciclo frente al anterior, gastos contra ingresos, cartera, alertas y detalle operativo " +
      "(reports.view; el bloque de montos y gastos solo con ALL y expenses.view)",
    parameters: [query("termId", "Ciclo (por defecto el activo)"), query("levelId", "Nivel"), query("courseId", "Curso"), query("groupId", "Grupo")],
    responses: {
      200: {
        description:
          "{ term, previousTerm, indicators, movements, enrollmentByLevel, enrollmentTrend, incomeVsProjection, incomeVsExpenses, " +
          "expenses, financialPosition, incomeByConcept, recentPayments, recentMovements, groupsByOccupancy, alerts }",
      },
      400: { description: "Filtro inválido" },
    },
  });

  const reports = Router();
  reports.use(authenticate, requiresPermission("reports.view"));
  reports.get("/", asyncHandler(controller.catalog));
  reports.get("/:type", asyncHandler(controller.run));

  const dashboard = Router();
  dashboard.use(authenticate, requiresPermission("reports.view"));
  dashboard.get("/", asyncHandler(controller.dashboard));
  dashboard.get("/executive", asyncHandler(controller.executive));
  return { reports, dashboard };
};
