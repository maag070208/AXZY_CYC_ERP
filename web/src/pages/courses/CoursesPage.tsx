import { useState } from "react";
import { ITButton, ITConfirmDialog, ITFlex, ITPage, ITText } from "@axzydev/axzy_ui_system";
import { FaBook, FaPlus, FaSync } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { courseApi, type Course } from "@entities/course";
import { CoursesTable, useCoursesTable, type CourseAction } from "@features/course/courses-list";
import { CourseFormDialog } from "@features/course/course-form";

/** `/courses` (M07): oferta académica. */
export default function CoursesPage() {
  const { t } = useTranslation(["courses", "common"]);
  const notify = useNotify();
  const canManage = useCan("courses.manage");
  const fx = useCoursesTable();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [toggling, setToggling] = useState<{ course: Course; active: boolean } | null>(null);

  const onAction = (action: CourseAction, course: Course) => {
    if (action === "edit") {
      setEditing(course);
      setFormOpen(true);
    } else setToggling({ course, active: action === "reactivate" });
  };

  const toggle = async () => {
    if (!toggling) return;
    try {
      if (toggling.active) await courseApi.reactivate(toggling.course.id);
      else await courseApi.deactivate(toggling.course.id);
      notify.success(toggling.active ? t("courses.reactivated") : t("courses.deactivated"));
      setToggling(null);
      fx.reload();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  return (
    <ITPage
      noPadding
      title={t("courses.title")}
      description={t("courses.description", { count: fx.total })}
      icon={<FaBook size={20} />}
      actions={
        <ITFlex gap={2}>
          <ITButton variant="outlined" color="secondary" onClick={fx.reload}>
            <ITFlex align="center" gap={1}><FaSync size={11} /><ITText className="font-bold text-[11px]">{t("common:actions.reload")}</ITText></ITFlex>
          </ITButton>
          {canManage && (
            <ITButton variant="filled" color="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <ITFlex align="center" gap={1}><FaPlus size={11} /><ITText className="font-bold text-[11px]">{t("courses.new")}</ITText></ITFlex>
            </ITButton>
          )}
        </ITFlex>
      }
    >
      <CoursesTable fx={fx} onAction={onAction} />
      <CourseFormDialog
        isOpen={formOpen}
        course={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(_, created) => {
          setFormOpen(false);
          notify.success(created ? t("courses.created") : t("courses.saved"));
          fx.reload();
        }}
      />
      <ITConfirmDialog
        isOpen={!!toggling}
        onClose={() => setToggling(null)}
        onConfirm={() => void toggle()}
        title={toggling?.active ? t("common:actions.reactivate") : t("courses.deactivateTitle", { name: toggling?.course.name ?? "" })}
        message={toggling?.active ? toggling.course.name : t("courses.deactivateMessage")}
        confirmLabel={toggling?.active ? t("common:actions.reactivate") : t("common:actions.deactivate")}
        cancelLabel={t("common:actions.cancel")}
        variant={toggling?.active ? "success" : "danger"}
      />
    </ITPage>
  );
}
