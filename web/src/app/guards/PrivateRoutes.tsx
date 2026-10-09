import {
  ITLayout,
  type ITNavigationItem,
  type ITSidebarProps,
} from "@axzydev/axzy_ui_system";
import { useCallback, useEffect, type ReactNode } from "react";
import { FaCog, FaHistory, FaHouseUser, FaListUl, FaUserShield, FaUsers } from "react-icons/fa";
import { useDispatch, useSelector } from "react-redux";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { AppDispatch, RootState } from "@app/store";
import { authApi, logout, meThunk } from "@entities/user";
import { APP_SCREENS, isScreenVisible, type AppScreen } from "@entities/permission";
import cycMark from "@shared/assets/logos/logo-mark.svg";

/** Icono del menú por pantalla (el catálogo vive en `@entities/permission`). */
const NAV_ICONS: Record<string, ReactNode> = {
  home: <FaHouseUser size={14} />,
  users: <FaUsers size={14} />,
  roles: <FaUserShield size={14} />,
  audit: <FaHistory size={14} />,
  catalogs: <FaListUl size={14} />,
  settings: <FaCog size={14} />,
};

export default function PrivateRoutes() {
  const { t: tt, i18n } = useTranslation(["common"]);
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch<AppDispatch>();
  const { token, refreshToken, user } = useSelector((s: RootState) => s.auth);

  // Al abrir la app (o iniciar sesión) se refresca `/auth/me`: el usuario
  // guardado puede traer permisos o idioma viejos.
  useEffect(() => {
    if (token) dispatch(meThunk());
  }, [token, dispatch]);

  // La interfaz sigue el idioma del sistema que trae la sesión.
  useEffect(() => {
    if (user?.language && user.language !== i18n.language) {
      void i18n.changeLanguage(user.language);
    }
  }, [user, i18n]);

  // Primero se revoca el refresh en la API (con el access aún vigente) y
  // después se limpia la sesión local; al revés, la petición saldría sin token.
  const handleLogout = useCallback(async () => {
    await authApi.logout(refreshToken).catch(() => undefined);
    dispatch(logout());
    navigate("/login");
  }, [dispatch, navigate, refreshToken]);

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Contraseña temporal: no se navega a ningún otro lado hasta cambiarla.
  if (user?.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  // El menú se arma desde el catálogo de pantallas (`APP_SCREENS`) y los
  // permisos efectivos (`GET /auth/me`); la web no reimplementa la matriz.
  const permissions = user?.permissions;

  const isScreenActive = (screen: AppScreen): boolean => {
    if (!screen.path) return false;
    return screen.match === "exact"
      ? location.pathname === screen.path
      : location.pathname === screen.path || location.pathname.startsWith(`${screen.path}/`);
  };

  const canView = (screen: AppScreen): boolean =>
    isScreenVisible(permissions, screen, user?.role);

  const navigationItems: ITNavigationItem[] = APP_SCREENS.filter(canView).map((screen) => ({
    id: screen.id,
    label: tt(screen.labelKey),
    icon: NAV_ICONS[screen.id],
    ...(screen.path ? { action: () => navigate(screen.path!) } : {}),
    isActive: isScreenActive(screen),
  }));

  const sidebar: ITSidebarProps = {
    navigationItems,
    isCollapsed: true,
  };

  const topBar = {
    logo: <img src={cycMark} alt="CYC" className="h-10 w-auto object-contain" />,
    logoText: "CYC",
    userMenu: user
      ? {
          userName: user.name ?? "—",
          userEmail: user.username,
          menuItems: [
            { label: tt("nav.changePassword"), onClick: () => navigate("/change-password") },
            { label: tt("nav.logout"), onClick: handleLogout },
          ],
        }
      : undefined,
  };

  return (
    <ITLayout topBar={topBar} sidebar={sidebar} contentClassName="max-w-screen! m-0! !px-2">
      <Outlet />
    </ITLayout>
  );
}
