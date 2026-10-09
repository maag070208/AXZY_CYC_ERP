// API pública del slice "permission". Nada fuera de esta carpeta debe importar
// directo desde api/ o model/ — todo pasa por este barrel.
export {
  permissionApi,
  POLICY_OPERATORS,
  type PermissionCatalog,
  type RoleAdmin,
  type MatrixCell,
  type PermissionAdminData,
  type RoleCreateDto,
  type RoleUpdateDto,
  type MatrixChange,
  type MatrixSaveResult,
  type Policy,
  type PolicyAction,
  type PolicyCondition,
  type PolicyEffect,
  type PolicyInput,
  type PolicyOperator,
  type PolicyValue,
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
export { useRoles } from "./model/useRoles";
