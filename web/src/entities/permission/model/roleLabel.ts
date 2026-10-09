import { i18n } from "@shared/i18n";

/**
 * Nombre visible de un rol. Los roles base (`ADMIN`, `SCHOOL_CONTROL`,
 * `TEACHER`, `STUDENT`) se traducen por i18n (D-046); los roles que crea el
 * administrador conservan el nombre que se les dio.
 */
export const roleLabel = (role: { key: string; name?: string | null }): string => {
  const key = `users:roles.${role.key}`;
  return i18n.exists(key) ? i18n.t(key as "users:roles.ADMIN") : (role.name ?? role.key);
};
