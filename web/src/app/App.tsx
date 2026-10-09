import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "@pages/auth/LoginPage";
import ForgotPasswordPage from "@pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@pages/auth/ResetPasswordPage";
import HomePage from "@pages/home/HomePage";
import UsersListPage from "@pages/users/UsersListPage";
import RolesPage from "@pages/roles/RolesPage";
import AuditPage from "@pages/audit/AuditPage";
import CatalogsPage from "@pages/catalogs/CatalogsPage";
import SettingsPage from "@pages/settings/SettingsPage";
import ChangePasswordPage from "@pages/account/ChangePasswordPage";
import PrivateRoutes from "./guards/PrivateRoutes";
import RequiresPermission from "./guards/RequirePermission";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<PrivateRoutes />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route
          path="/users"
          element={
            <RequiresPermission permission="users.view">
              <UsersListPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/roles"
          element={
            <RequiresPermission permission="roles.manage">
              <RolesPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/audit"
          element={
            <RequiresPermission permission="audit.view">
              <AuditPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/catalogs"
          element={
            <RequiresPermission permission={["levels.view", "terms.view", "config.view"]}>
              <CatalogsPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/settings"
          element={
            <RequiresPermission permission="config.view">
              <SettingsPage />
            </RequiresPermission>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
