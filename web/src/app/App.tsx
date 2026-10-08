import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "@pages/auth/LoginPage";
import HomePage from "@pages/home/HomePage";
import UsersListPage from "@pages/users/UsersListPage";
import RolesPage from "@pages/roles/RolesPage";
import PrivateRoutes from "./guards/PrivateRoutes";
import RequiresPermission from "./guards/RequirePermission";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<PrivateRoutes />}>
        <Route path="/" element={<HomePage />} />

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
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
