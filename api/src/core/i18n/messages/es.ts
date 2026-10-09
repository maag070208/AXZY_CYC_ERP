// Textos de la API en español. `en.ts` debe tener exactamente las mismas llaves.
export const es = {
  errors: {
    // --- Genéricos ---
    ROUTE_NOT_FOUND: "No existe la ruta {{method}} {{path}}",
    RECORD_NOT_FOUND: "Registro no encontrado",
    DUPLICATE_RECORD: "Ya existe un registro con esos datos (duplicado)",
    INVALID_REFERENCE: "Referencia inválida: dependencia de otro registro",
    DATABASE_ERROR: "Error de base de datos",
    INTERNAL_ERROR: "Error interno del servidor",
    VALIDATION_ERROR: "Los datos enviados no son válidos",
    INVALID_BODY: "Body inválido",
    INVALID_FILTER: "Valor inválido en el filtro \"{{field}}\"",
    INVALID_RANGE: "La fecha inicial no puede ser posterior a la final",
    UPDATE_FIELDS_REQUIRED: "Debe enviar al menos un campo para actualizar",
    FIELD_REQUIRED: "{{field}} es obligatorio",
    FIELD_TOO_LONG: "{{field}} excede {{max}} caracteres",
    FIELD_MUST_BE_STRING: "{{field}} debe ser string",
    FIELD_MUST_BE_BOOLEAN: "{{field}} debe ser booleano",
    INVALID_SORT_ORDER: "sortOrder debe ser un entero mayor o igual a 0",
    FORBIDDEN: "No autorizado",
    STORAGE_NOT_CONFIGURED: "Almacenamiento de archivos no configurado",

    // --- Autenticación y sesión ---
    TOKEN_MISSING: "No se proporcionó token",
    INVALID_AUTHORIZATION_HEADER: "Formato de Authorization inválido",
    INVALID_TOKEN: "Token inválido o expirado",
    INVALID_SESSION: "Sesión inválida: el usuario ya no existe o está inactivo",
    UNAUTHENTICATED: "No autenticado",
    INSUFFICIENT_PERMISSIONS: "Permisos insuficientes",
    INVALID_CREDENTIALS: "Usuario o contraseña incorrectos",
    ACCOUNT_DEACTIVATED: "Tu cuenta fue dada de baja. Contacta al administrador.",
    ACCOUNT_LOCKED: "La cuenta está bloqueada temporalmente por intentos fallidos. Intenta de nuevo más tarde.",
    INVALID_REFRESH_TOKEN: "Token de renovación inválido o expirado",
    RESET_TOKEN_INVALID: "Token de recuperación inválido, expirado o ya usado",

    // --- Usuarios ---
    USER_NOT_FOUND: "Usuario no encontrado",
    USERNAME_TAKEN: "El username ya existe",
    EMAIL_TAKEN: "Ya existe un usuario con ese correo",
    INVALID_ROLE: "Rol inválido: {{role}}",
    ROLE_INACTIVE: "El rol \"{{key}}\" está desactivado: actívalo antes de asignarlo",
    CANNOT_DEACTIVATE_SELF: "No puedes darte de baja a ti mismo",
    CANNOT_CHANGE_OWN_PERMISSIONS: "No puedes cambiar tus propios permisos",
    USER_ALREADY_ACTIVE: "El usuario ya estaba activo",
    USER_ALREADY_DEACTIVATED: "El usuario ya estaba dado de baja",
    USER_ID_REQUIRED: "User ID requerido",

    // --- Excepciones de permiso ---
    PERMISSION_DOES_NOT_EXIST: "El permiso \"{{permission}}\" no existe",
    PERMISSION_INACTIVE: "El permiso \"{{permission}}\" está inactivo",
    PERMISSION_EXCEPTION_NOT_FOUND: "El usuario no tiene una excepción para \"{{permission}}\"",
    SENSITIVE_PERMISSION_REQUIRES_ADMIN: "Solo ADMIN puede otorgar el permiso sensible \"{{permission}}\"",
    INVALID_SCOPE_FOR_PERMISSION: "Alcance inválido para \"{{permission}}\": {{scope}}",

    // --- Roles ---
    ROLE_NOT_FOUND: "Rol no encontrado: {{key}}",
    ROLE_KEY_TAKEN: "Ya existe un rol con la clave \"{{key}}\"",
    ROLE_SYSTEM_PROTECTED: "El rol \"{{key}}\" es un rol base del sistema: no se puede renombrar, desactivar ni eliminar",
    ROLE_HAS_USERS: "No se puede eliminar: {{userCount}} cuenta(s) tienen el rol \"{{key}}\"",
    ROLE_KEY_TOO_LONG: "La clave del rol excede {{max}} caracteres",
    INVALID_ROLE_KEY: "La clave del rol debe estar en MAYÚSCULAS (letras, dígitos y guion bajo)",
    ADMIN_PERMISSION_REQUIRED: "No se puede dejar al sistema sin un rol activo con el permiso \"{{permission}}\"",

    // --- Catálogo de permisos ---
    PERMISSION_KEY_TAKEN: "Ya existe un permiso con la clave \"{{key}}\"",
    PERMISSION_NOT_FOUND: "Permiso no encontrado: {{key}}",
    INVALID_PERMISSION_KEY: "La clave debe tener el formato module.action (minúsculas, dígitos y guion bajo)",
    KEY_TOO_LONG: "La clave excede {{max}} caracteres",
    SCOPES_REQUIRED: "scopes debe ser un arreglo no vacío",
    INVALID_SCOPE: "Alcance inválido: {{scope}}",
    DUPLICATE_SCOPE: "Alcance duplicado: {{scope}}",
    SCOPE_HAS_GRANTS: "No se pueden quitar alcances con concesiones activas ({{grants}})",

    // --- Matriz ---
    CHANGES_ARRAY_REQUIRED: "changes debe ser un arreglo no vacío",
    TOO_MANY_CHANGES: "changes admite máximo {{max}} filas por petición",
    CHANGES_REQUIRED: "Debe enviar al menos un cambio en la matriz",
    INVALID_CHANGE_ROLE: "changes[{{index}}].role inválido: {{role}}",
    CHANGE_PERMISSION_REQUIRED: "changes[{{index}}].permission es obligatorio",
    CHANGE_PERMISSION_TOO_LONG: "changes[{{index}}].permission excede {{max}} caracteres",
    INVALID_CHANGE_SCOPE: "changes[{{index}}].scope inválido: {{scope}}",

    // --- Políticas ABAC ---
    POLICY_DENIED: "Una política de acceso impide esta operación ({{policy}})",
    POLICY_NOT_FOUND: "Política no encontrada",
    POLICY_KEY_TAKEN: "Ya existe una política con la clave \"{{key}}\"",
    POLICY_ACTION_UNKNOWN: "La acción \"{{action}}\" no admite políticas",
    POLICY_FIELD_UNKNOWN: "La acción \"{{action}}\" no expone el campo \"{{field}}\"",

    // --- Contraseña y cuenta ---
    CURRENT_PASSWORD_INVALID: "La contraseña actual no es correcta",
    PASSWORD_REUSED: "La contraseña nueva debe ser distinta de la actual",
    USER_NOT_LOCKED: "La cuenta no está bloqueada",

    // --- Configuración y catálogos (M11) ---
    SETTING_UNKNOWN: "El parámetro \"{{key}}\" no existe",
    SETTING_INVALID: "Valor inválido para \"{{key}}\"",
    SETTINGS_REQUIRED: "Debe enviar al menos un parámetro",
    CATALOG_ITEM_NOT_FOUND: "Registro de catálogo no encontrado",
    CATALOG_ITEM_ALREADY_INACTIVE: "El registro ya estaba desactivado",
    TERM_DATES_INVALID: "La fecha de inicio no puede ser posterior a la de fin",
    TERM_ALREADY_ACTIVE: "El ciclo ya es el activo",

    // --- Bitácora ---
    AUDIT_LOG_NOT_FOUND: "Registro de auditoría no encontrado",
  },
  validation: {
    USERNAME_MIN_LENGTH: "El usuario debe tener al menos 3 caracteres",
    PASSWORD_MIN_LENGTH: "La contraseña no cumple la longitud mínima requerida",
    INVALID_EMAIL: "Email inválido",
    NAME_REQUIRED: "El nombre es obligatorio",
    REASON_MIN_LENGTH: "El motivo debe tener al menos 3 caracteres",
    REQUIRED_FIELD: "Campo obligatorio",
    PASSWORD_MISMATCH: "Las contraseñas no coinciden",
    NOMBRE_REQUIRED: "El nombre es obligatorio",
    INVALID_DATE: "Fecha inválida (AAAA-MM-DD)",
    POLICY_KEY_FORMAT: "La clave debe ir en minúsculas, dígitos y guion bajo",
  },
  labels: {
    system: "Sistema",
    administrator: "Administrador",
    unassigned: "Sin asignar",
    unknown: "Desconocido",
  },
};

type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Messages = Shape<typeof es>;
