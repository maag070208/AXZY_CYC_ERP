// API pública del slice "user". Nada fuera de esta carpeta debe importar
// directo desde model/ o api/ — todo pasa por este barrel.
export * from "./model/types";
export * from "./model/auth.slice";
export * from "./model/usePermission";
export { default } from "./model/auth.slice";
export { authApi, usersApi } from "./api/userApi";
