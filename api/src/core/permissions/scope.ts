import type { Scope } from "./types";
import { scopeOf, type UserPermissions } from "./resolver";

/**
 * Registro sobre el que se evalúa un alcance. Genérico: los módulos de negocio
 * (M03+) lo poblarán con sus campos de propiedad/área. M02 no tiene recursos de
 * negocio, así que se deja como puerto.
 */
export interface ResourceReachable {
  /** Quién creó el registro. */
  ownerId?: string | null;
  /** Área/departamento del registro. */
  areaId?: string | null;
  /** Responsable o asignado. */
  assigneeId?: string | null;
}

/** ¿El registro cae dentro del alcance? `AREA` incluye lo propio. */
export const withinScope = (
  user: UserPermissions,
  scope: Scope,
  resource: ResourceReachable
): boolean => {
  switch (scope) {
    case "NONE":
      return false;
    case "ALL":
      return true;
    case "OWN":
      return isOwn(user, resource);
    case "AREA":
      return (
        isOwn(user, resource) ||
        (!!user.areaId && resource.areaId === user.areaId)
      );
  }
};

/** Lo "propio": lo creó o es su responsable. */
const isOwn = (user: UserPermissions, resource: ResourceReachable): boolean =>
  resource.ownerId === user.id || resource.assigneeId === user.id;

/** ¿El usuario puede operar sobre el recurso con el alcance de `permission`? */
export const scopeAllows = (
  user: UserPermissions,
  permission: string,
  resource: ResourceReachable
): boolean => withinScope(user, scopeOf(user, permission), resource);
