/** Convierte una ruta Express `/users/:id` a formato OpenAPI `/users/{id}`. */
export const toOpenApiPath = (expressPath: string): string =>
  expressPath.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
