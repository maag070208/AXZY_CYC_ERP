// API pública del slice "permission". Nada fuera de esta carpeta debe importar
// directo desde api/ o model/ — todo pasa por este barrel.
export {
  permissionApi,
  type PermissionCatalog,
  type RoleAdmin,
  type MatrixCell,
  type PermissionAdminData,
  type RoleCreateDto,
  type MatrixChange,
  type MatrixSaveResult,
} from "./api/permissionApi";
export {
  APP_SCREENS,
  isScreenVisible,
  screenHasPermission,
  screenScopeOf,
  type AppScreen,
  type NavLabelKey,
  type ScreenRequirement,
} from "./model/screens";
