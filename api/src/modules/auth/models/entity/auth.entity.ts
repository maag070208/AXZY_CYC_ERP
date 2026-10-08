/** Usuario de sesión, ya resuelto desde la BD (`user_roles` → roles). */
export interface AuthUserEntity {
  id: string;
  username: string;
  email: string;
  name: string;
  /** Rol principal (el de menor `sortOrder`). */
  role: string;
  /** Roles efectivos: principal + adicionales (solo activos). */
  roles: string[];
  active: boolean;
  passwordHash: string;
  mustChangePassword: boolean;
}

export interface UserRoleLink {
  role: { key: string; active: boolean; sortOrder: number };
}

export interface UserExceptionLink {
  permissionKey: string;
  scope: string;
  expiresAt: Date | null;
}
