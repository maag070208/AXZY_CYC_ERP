import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, Outlet } from "react-router-dom";
import type { AppDispatch, RootState } from "@app/store";
import { meThunk } from "@entities/user";

/**
 * Guard de solo sesión (sin layout): protege pantallas de cuenta que se
 * muestran a pantalla completa, como el cambio de contraseña. A diferencia de
 * `PrivateRoutes` (que envuelve con `ITLayout`), aquí no hay sidebar/topbar.
 */
export default function RequireAuth() {
  const dispatch = useDispatch<AppDispatch>();
  const { token } = useSelector((s: RootState) => s.auth);

  // Refresca `/auth/me` (permisos/idioma/flags) al entrar directo a la pantalla.
  useEffect(() => {
    if (token) dispatch(meThunk());
  }, [token, dispatch]);

  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}
