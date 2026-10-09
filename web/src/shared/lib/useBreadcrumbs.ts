import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export interface Crumb {
  label: string | null | undefined;
  /** Ruta a la que lleva la miga; sin ella es la página actual (no navega). */
  to?: string;
}

/**
 * Migas de pan de `ITPage` (mismo patrón que PTNV): siempre arrancan en
 * «Inicio» y siguen con el rastro que arma la página. Las migas sin etiqueta
 * (dato aún cargando) se omiten.
 *
 *   const crumbs = useBreadcrumbs();
 *   <ITPage breadcrumbs={crumbs({ label: t("common:nav.students"), to: "/students" }, { label: student?.fullName })} />
 */
export const useBreadcrumbs = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  return useCallback(
    (...trail: Crumb[]) => [
      { label: t("breadcrumbs.home"), onClick: () => navigate("/") },
      ...trail
        .filter((crumb): crumb is Crumb & { label: string } => Boolean(crumb.label))
        .map(({ label, to }) => (to ? { label, onClick: () => navigate(to) } : { label })),
    ],
    [navigate, t]
  );
};
