import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ITButton, ITFlex, ITPage, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { FaChartBar, FaChartLine } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { catalogApi, termsApi, type Term } from "@entities/config";
import { courseApi, type CourseOption } from "@entities/course";
import { groupApi, type Group } from "@entities/group";
import type { ExecutiveFilters } from "@entities/report";
import { useCan } from "@entities/user";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";
import { PanelCard } from "@shared/ui/panel-card";
import { ExecutiveDashboardView } from "@widgets/executive-dashboard";

/** `/executive` (M21): tablero ejecutivo con filtros por ciclo, nivel, curso y grupo. */
export default function ExecutivePage() {
  const { t } = useTranslation(["reports", "common"]);
  const crumbs = useBreadcrumbs();
  const navigate = useNavigate();
  const canTerms = useCan("terms.view");
  const canLevels = useCan("levels.view");
  const canCourses = useCan("courses.view");
  const [terms, setTerms] = useState<Term[]>([]);
  const [levels, setLevels] = useState<Array<{ id: string; name: string }>>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [filters, setFilters] = useState<ExecutiveFilters>({});

  useEffect(() => {
    if (canTerms) termsApi.options().then(setTerms).catch(() => setTerms([]));
    if (canLevels) catalogApi.options("levels").then(setLevels).catch(() => setLevels([]));
    if (canCourses) courseApi.options().then(setCourses).catch(() => setCourses([]));
  }, [canTerms, canLevels, canCourses]);

  useEffect(() => {
    groupApi
      .options({ ...(filters.termId ? { termId: filters.termId } : {}), ...(filters.courseId ? { courseId: filters.courseId } : {}) })
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [filters.termId, filters.courseId]);

  const set = (key: keyof ExecutiveFilters, value: string) =>
    setFilters((prev) => ({
      ...prev,
      [key]: value || undefined,
      // El grupo depende del ciclo y del curso: al cambiarlos se limpia.
      ...(key === "termId" || key === "courseId" ? { groupId: undefined } : {}),
    }));

  return (
    <ITPage
      breadcrumbs={crumbs({ label: t("common:nav.executive") })}
      title={t("executive.title")}
      description={t("executive.description")}
      icon={<FaChartLine size={20} />}
      actions={
        <ITButton variant="outlined" color="secondary" onClick={() => navigate("/reports")}>
          <ITFlex align="center" gap={1}>
            <FaChartBar size={12} />
            <ITText className="font-bold text-[11px]">{t("executive.reports")}</ITText>
          </ITFlex>
        </ITButton>
      }
    >
      <ITFlex direction="column" gap={4}>
        <PanelCard>
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {canTerms && (
              <ITSelect name="termId" label={t("executive.term")} value={filters.termId ?? ""} placeholder={t("executive.activeTerm")}
                options={terms.map((term) => ({ value: term.id, label: term.name }))} onChange={(e) => set("termId", e.target.value)} />
            )}
            {canLevels && (
              <ITSelect name="levelId" label={t("executive.level")} value={filters.levelId ?? ""} placeholder={t("executive.all")}
                options={levels.map((level) => ({ value: level.id, label: level.name }))} onChange={(e) => set("levelId", e.target.value)} />
            )}
            {canCourses && (
              <ITSelect name="courseId" label={t("executive.course")} value={filters.courseId ?? ""} placeholder={t("executive.all")}
                options={courses.map((course) => ({ value: course.id, label: course.name }))} onChange={(e) => set("courseId", e.target.value)} />
            )}
            <ITSelect name="groupId" label={t("executive.group")} value={filters.groupId ?? ""} placeholder={t("executive.all")}
              options={groups.map((group) => ({ value: group.id, label: `${group.courseName} · ${group.name}` }))} onChange={(e) => set("groupId", e.target.value)} />
          </div>
        </PanelCard>
        <ExecutiveDashboardView filters={filters} />
      </ITFlex>
    </ITPage>
  );
}
