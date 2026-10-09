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
import StudentsListPage from "@pages/students/StudentsListPage";
import StudentFormPage from "@pages/students/StudentFormPage";
import StudentDetailPage from "@pages/students/StudentDetailPage";
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
          path="/students"
          element={
            <RequiresPermission permission="students.view">
              <StudentsListPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/students/new"
          element={
            <RequiresPermission permission="students.create">
              <StudentFormPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/students/:id"
          element={
            <RequiresPermission permission="students.view">
              <StudentDetailPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/students/:id/edit"
          element={
            <RequiresPermission permission="students.edit">
              <StudentFormPage />
            </RequiresPermission>
          }
        />
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
