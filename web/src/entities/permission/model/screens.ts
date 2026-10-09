import type { Permission, PermissionMap, Scope, UserRole } from "@entities/user";

/**
 * Catálogo de pantallas de la app, en el mismo orden que el menú lateral.
 *
 * Es la **fuente única** de verdad: lo consume `app/guards/PrivateRoutes.tsx`
 * (para armar el menú) y lo usará la vista «Qué ve cada rol» de `/roles`. Si
 * agregás una pantalla al menú, agregala aquí.
 *
 * Cada entrada requiere uno o más permisos (`requirement`) o una regla fija de
 * negocio (`fixedRole`). Un grupo (con `children`) es visible si lo es al menos
 * uno de sus hijos.
 */

/** Requisito de visibilidad: cualquiera (`anyOf`) o todas (`allOf`) las claves. */
export type ScreenRequirement =
  | { readonly anyOf: readonly Permission[] }
  | { readonly allOf: readonly Permission[] };

/** Claves del menú en el namespace `common` (para tipar la i18n). */
export type NavLabelKey =
  | "nav.home"
  | "nav.settings"
  | "nav.users"
  | "nav.roles"
  | "nav.audit"
  | "nav.catalogs"
  | "nav.students"
  | "nav.teachers";

export interface AppScreen {
  readonly id: string;
  /** Clave i18n en el namespace `common` (p. ej. `nav.users`). */
  readonly labelKey: NavLabelKey;
  /** Ruta a la que navega el ítem del menú. */
  readonly path?: string;
  /** Modo de resaltado de la ruta. Por defecto `prefix`. */
  readonly match?: "exact" | "prefix";
  /** Permiso(s) requeridos. Ausente = visible para cualquier sesión. */
  readonly requirement?: ScreenRequirement;
  /** Regla fija: solo este rol la ve, sin importar permisos. */
  readonly fixedRole?: UserRole;
  readonly children?: readonly AppScreen[];
}

export const APP_SCREENS: readonly AppScreen[] = [
  {
    id: "home",
    labelKey: "nav.home",
    path: "/",
    match: "exact",
  },
  {
    id: "students",
    labelKey: "nav.students",
    path: "/students",
    requirement: { anyOf: ["students.view"] },
  },
  {
    id: "teachers",
    labelKey: "nav.teachers",
    path: "/teachers",
    requirement: { anyOf: ["teachers.view"] },
  },
  {
    id: "users",
    labelKey: "nav.users",
    path: "/users",
    requirement: { anyOf: ["users.view"] },
  },
  {
    id: "roles",
    labelKey: "nav.roles",
    path: "/roles",
    requirement: { anyOf: ["roles.manage"] },
  },
  {
    id: "audit",
    labelKey: "nav.audit",
    path: "/audit",
    requirement: { anyOf: ["audit.view"] },
  },
  {
    id: "catalogs",
    labelKey: "nav.catalogs",
    path: "/catalogs",
    requirement: { anyOf: ["levels.view", "terms.view", "config.view"] },
  },
  {
    id: "settings",
    labelKey: "nav.settings",
    path: "/settings",
    requirement: { anyOf: ["config.view"] },
  },
];

/** ¿La sesión tiene la clave con cualquier alcance distinto de NONE? */
export const screenHasPermission = (
  permissions: PermissionMap | undefined,
  permission: Permission
): boolean => (permissions?.[permission] ?? "NONE") !== "NONE";

/** Alcance efectivo de una clave para la sesión (NONE si no aplica). */
export const screenScopeOf = (
  permissions: PermissionMap | undefined,
  permission: Permission
): Scope => permissions?.[permission] ?? "NONE";

/**
 * ¿La pantalla es visible para un mapa de permisos y un rol? Respeta el
 * requisito (anyOf/allOf), la regla fija (`fixedRole`) y, en grupos, la
 * visibilidad de sus hijos.
 */
export const isScreenVisible = (
  permissions: PermissionMap | undefined,
  screen: AppScreen,
  role?: string
): boolean => {
  if (screen.fixedRole) return role === screen.fixedRole;
  if (screen.requirement) {
    if ("allOf" in screen.requirement) {
      return screen.requirement.allOf.every((key) => screenHasPermission(permissions, key));
    }
    return screen.requirement.anyOf.some((key) => screenHasPermission(permissions, key));
  }
  if (screen.children?.length) {
    return screen.children.some((child) => isScreenVisible(permissions, child, role));
  }
  return true;
};
