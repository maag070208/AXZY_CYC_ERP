import {
  ITLayout,
  type ITNavigationItem,
  type ITSidebarProps,
} from "@axzydev/axzy_ui_system";
import { useCallback, useEffect, type ReactNode } from "react";
import { FaBook, FaCashRegister, FaChalkboardTeacher, FaChartBar, FaClipboardCheck, FaCog, FaFileSignature, FaQuestionCircle, FaHistory, FaHouseUser, FaLayerGroup, FaListUl, FaUserGraduate, FaUserShield, FaUsers, FaUserCheck, FaBell, FaDatabase, FaUserFriends, FaGraduationCap, FaSlidersH, FaStream } from "react-icons/fa";
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
  people: <FaUserFriends size={14} />,
  academic: <FaGraduationCap size={14} />,
  admin: <FaCog size={14} />,
  students: <FaUserGraduate size={14} />,
  teachers: <FaChalkboardTeacher size={14} />,
  courses: <FaBook size={14} />,
  programs: <FaStream size={14} />,
  groups: <FaLayerGroup size={14} />,
  finance: <FaCashRegister size={14} />,
  questions: <FaQuestionCircle size={14} />,
  exams: <FaClipboardCheck size={14} />,
  myExams: <FaFileSignature size={14} />,
  attendance: <FaUserCheck size={14} />,
  notifications: <FaBell size={14} />,
  migration: <FaDatabase size={14} />,
  reports: <FaChartBar size={14} />,
  users: <FaUsers size={14} />,
  roles: <FaUserShield size={14} />,
  audit: <FaHistory size={14} />,
  catalogs: <FaListUl size={14} />,
  settings: <FaSlidersH size={14} />,
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
  // Soporta hasta dos niveles: ítem → [subítem | grupo con título → subítems].
  const permissions = user?.permissions;

  const isScreenActive = (screen: AppScreen): boolean => {
    if (screen.path) {
      const hit =
        screen.match === "exact"
          ? location.pathname === screen.path
          : location.pathname === screen.path || location.pathname.startsWith(`${screen.path}/`);
      if (hit) return true;
    }
    return screen.children?.some((child) => isScreenActive(child)) ?? false;
  };

  const canView = (screen: AppScreen): boolean =>
    isScreenVisible(permissions, screen, user?.role);

  const toSubItem = (screen: AppScreen) => ({
    id: screen.id,
    label: tt(screen.labelKey),
    action: () => {
      if (screen.path) navigate(screen.path);
    },
    isActive: isScreenActive(screen),
  });

  const toNavigationItem = (screen: AppScreen): ITNavigationItem | null => {
    if (!canView(screen)) return null;
    const children = (screen.children ?? []).filter((child) => canView(child));
    return {
      id: screen.id,
      label: tt(screen.labelKey),
      icon: NAV_ICONS[screen.id],
      ...(screen.path ? { action: () => navigate(screen.path!) } : {}),
      isActive: isScreenActive(screen),
      ...(children.length > 0
        ? {
            // Un hijo con hijos es una sección con título (no clickeable).
            subitems: children.map((child) =>
              child.children?.length
                ? {
                    id: child.id,
                    label: tt(child.labelKey),
                    items: child.children.filter((leaf) => canView(leaf)).map(toSubItem),
                  }
                : toSubItem(child)
            ),
          }
        : {}),
    };
  };

  const navigationItems: ITNavigationItem[] = APP_SCREENS.map(toNavigationItem).filter(
    (item): item is ITNavigationItem => item !== null
  );

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
