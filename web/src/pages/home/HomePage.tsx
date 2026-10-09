import { useEffect, useState } from "react";
import { ITButton, ITFlex, ITPage, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { FaCalendarAlt, FaHouseUser, FaKey, FaUserPlus, FaUserShield } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import type { RootState } from "@app/store";
import { catalogApi, termsApi, type Term } from "@entities/config";
import { courseApi, type CourseOption } from "@entities/course";
import { groupApi, type Group } from "@entities/group";
import type { ExecutiveFilters } from "@entities/report";
import { useCan } from "@entities/user";
import { KpiTile } from "@shared/ui/kpi-tile";
import { PanelCard } from "@shared/ui/panel-card";
import { DashboardView } from "@widgets/dashboard";

/**
 * `/` — Inicio (M21 ampliado): tablero ejecutivo del ciclo. Los filtros son los
 * mismos del tablero; sin `reports.view` la persona ve su resumen de sesión.
 */
export default function HomePage() {
  const { t } = useTranslation(["common", "reports"]);
  const navigate = useNavigate();
  const user = useSelector((s: RootState) => s.auth.user);
  const canDashboard = useCan("reports.view");
  const canTerms = useCan("terms.view");
  const canLevels = useCan("levels.view");
  const canCourses = useCan("courses.view");
  const canCreateStudents = useCan("students.create");
  const [terms, setTerms] = useState<Term[]>([]);
  const [levels, setLevels] = useState<Array<{ id: string; name: string }>>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [filters, setFilters] = useState<ExecutiveFilters>({});

  useEffect(() => {
    if (!canDashboard) return;
    if (canTerms) termsApi.options().then(setTerms).catch(() => setTerms([]));
    if (canLevels) catalogApi.options("levels").then(setLevels).catch(() => setLevels([]));
    if (canCourses) courseApi.options().then(setCourses).catch(() => setCourses([]));
  }, [canDashboard, canTerms, canLevels, canCourses]);

  useEffect(() => {
    if (!canDashboard) return;
    groupApi
      .options({ ...(filters.termId ? { termId: filters.termId } : {}), ...(filters.courseId ? { courseId: filters.courseId } : {}) })
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [canDashboard, filters.termId, filters.courseId]);

  const set = (key: keyof ExecutiveFilters, value: string) =>
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      // El grupo depende del ciclo y del curso: al cambiarlos se limpia.
      ...(key === "termId" || key === "courseId" ? { groupId: undefined } : {}),
    }));

  const selectedTerm = terms.find((term) => term.id === filters.termId);
  const period = selectedTerm ? `${selectedTerm.startDate} – ${selectedTerm.endDate}` : t("reports:activeTerm");

  if (canDashboard) {
    return (
      <ITPage
        className="m-0! px-4! max-w-screen!"
        noPadding
        title={t("home.title")}
        description={t("home.welcome", { name: user?.name ?? "" })}
        icon={<FaHouseUser size={20} />}
        actions={
          <ITFlex align="center" gap={2}>
            <ITFlex align="center" gap={1} className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600">
              <FaCalendarAlt size={12} />
              <ITText className="font-bold text-[11px]">{period}</ITText>
            </ITFlex>
            {canCreateStudents && (
              <ITButton variant="outlined" color="primary" onClick={() => navigate("/students")}>
                <ITFlex align="center" gap={1}>
                  <FaUserPlus size={11} />
                  <ITText className="font-bold text-[11px]">{t("home.manageStudents")}</ITText>
                </ITFlex>
              </ITButton>
            )}
          </ITFlex>
        }
      >
        <div className="flex flex-col gap-4">
          <PanelCard>
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {canTerms && (
                <ITSelect name="termId" label={t("reports:home.term")} value={filters.termId ?? ""} placeholder={t("reports:activeTerm")}
                  options={terms.map((term) => ({ value: term.id, label: term.name }))} onChange={(e) => set("termId", e.target.value)} />
              )}
              {canLevels && (
                <ITSelect name="levelId" label={t("reports:home.level")} value={filters.levelId ?? ""} placeholder={t("reports:home.all")}
                  options={levels.map((level) => ({ value: level.id, label: level.name }))} onChange={(e) => set("levelId", e.target.value)} />
              )}
              {canCourses && (
                <ITSelect name="courseId" label={t("reports:home.course")} value={filters.courseId ?? ""} placeholder={t("reports:home.all")}
                  options={courses.map((course) => ({ value: course.id, label: course.name }))} onChange={(e) => set("courseId", e.target.value)} />
              )}
              <ITSelect name="groupId" label={t("reports:home.group")} value={filters.groupId ?? ""} placeholder={t("reports:home.all")}
                options={groups.map((group) => ({ value: group.id, label: `${group.courseName} · ${group.name}` }))} onChange={(e) => set("groupId", e.target.value)} />
            </div>
          </PanelCard>
          <DashboardView filters={filters} />
        </div>
      </ITPage>
    );
  }

  const permissionCount = Object.keys(user?.permissions ?? {}).length;
  const roles = (user?.roles ?? (user?.role ? [user.role] : [])).join(", ");

  return (
    <ITPage
      className="m-0! px-4! max-w-screen!"
      noPadding
      title={t("home.title")}
      description={t("home.description")}
      icon={<FaHouseUser size={20} />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile
          label={t("home.title")}
          value={user?.name ?? "—"}
          icon={<FaUserShield size={16} />}
          tone="sky"
          hint={t("home.welcome", { name: user?.name ?? "" })}
        />
        <KpiTile label={t("labels.role")} value={roles || "—"} icon={<FaUserShield size={16} />} tone="violet" />
        <KpiTile label={t("labels.permissions")} value={permissionCount} icon={<FaKey size={16} />} tone="emerald" />
      </div>

      <div className="mt-4">
        <PanelCard title={t("nav.settings")} description={t("home.description")}>
          <p className="text-[12px] text-slate-600">{t("home.welcome", { name: user?.name ?? "" })}</p>
        </PanelCard>
      </div>
    </ITPage>
  );
}
