import { ITButton, ITFlex, ITPage, ITText } from "@axzydev/axzy_ui_system";
import { FaFileExcel, FaPlus, FaSync, FaUserGraduate, FaUserSlash, FaUsers } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { StudentsTable, useStudentsTable } from "@features/student/students-list";
import { KpiTile } from "@shared/ui/kpi-tile";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/** `/students`: búsqueda server-side, KPIs por estatus y exportación (M03). */
export default function StudentsListPage() {
  const { t } = useTranslation(["students", "common"]);
  const crumbs = useBreadcrumbs();
  const navigate = useNavigate();
  const notify = useNotify();
  const canCreate = useCan("students.create");
  const canExport = useCan("students.export");
  const fx = useStudentsTable();

  const exportExcel = async () => {
    try {
      await fx.exportExcel();
      notify.success(t("list.exported"));
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.load")));
    }
  };

  return (
    <ITPage
      breadcrumbs={crumbs({ label: t("common:nav.students") })}
      noPadding
      title={t("list.title")}
      description={t("list.description", { count: fx.total })}
      icon={<FaUserGraduate size={20} />}
      actions={
        <ITFlex gap={2}>
          <ITButton variant="outlined" color="secondary" onClick={fx.reload}>
            <ITFlex align="center" gap={1}>
              <FaSync size={11} />
              <ITText className="font-bold text-[11px]">{t("common:actions.reload")}</ITText>
            </ITFlex>
          </ITButton>
          {canExport && (
            <ITButton variant="outlined" color="success" disabled={fx.exporting} onClick={() => void exportExcel()}>
              <ITFlex align="center" gap={1}>
                <FaFileExcel size={11} />
                <ITText className="font-bold text-[11px]">{t("list.export")}</ITText>
              </ITFlex>
            </ITButton>
          )}
          {canCreate && (
            <ITButton variant="filled" color="primary" onClick={() => navigate("/students/new")}>
              <ITFlex align="center" gap={1}>
                <FaPlus size={11} />
                <ITText className="font-bold text-[11px]">{t("list.new")}</ITText>
              </ITFlex>
            </ITButton>
          )}
        </ITFlex>
      }
    >
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiTile label={t("kpi.total")} value={fx.summary?.total ?? "—"} icon={<FaUsers size={16} />} tone="sky" />
        <KpiTile label={t("kpi.active")} value={fx.summary?.active ?? "—"} icon={<FaUserGraduate size={16} />} tone="emerald" />
        <KpiTile label={t("kpi.withdrawn")} value={fx.summary?.withdrawn ?? "—"} icon={<FaUserSlash size={16} />} tone="rose" />
      </div>
      <StudentsTable fx={fx} onOpen={(student) => navigate(`/students/${student.id}`)} />
    </ITPage>
  );
}
