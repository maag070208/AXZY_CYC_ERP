import { useState } from "react";
import { ITButton, ITConfirmDialog, ITDialog, ITFlex, ITPage, ITText, ITTextarea } from "@axzydev/axzy_ui_system";
import { FaChalkboardTeacher, FaPlus, FaSync } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { teacherApi, type Teacher } from "@entities/teacher";
import { TeachersTable, useTeachersTable, type TeacherAction } from "@features/teacher/teachers-list";
import { TeacherFormDialog } from "@features/teacher/teacher-form";

/** `/teachers` (M04): profesores, su cuenta e invitación. */
export default function TeachersPage() {
  const { t } = useTranslation(["teachers", "common"]);
  const notify = useNotify();
  const canCreate = useCan("teachers.create");
  const fx = useTeachersTable();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [resending, setResending] = useState<Teacher | null>(null);
  const [deactivating, setDeactivating] = useState<Teacher | null>(null);
  const [reactivating, setReactivating] = useState<Teacher | null>(null);
  const [reason, setReason] = useState("");

  const run = async (call: () => Promise<unknown>, message: string, close: () => void) => {
    try {
      await call();
      close();
      notify.success(message);
      fx.reload();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  const onAction = (action: TeacherAction, teacher: Teacher) => {
    if (action === "edit") {
      setEditing(teacher);
      setFormOpen(true);
    } else if (action === "resend") setResending(teacher);
    else if (action === "deactivate") {
      setReason("");
      setDeactivating(teacher);
    } else setReactivating(teacher);
  };

  const deactivateTitle = t("deactivate.title", { name: deactivating?.nombreCompleto ?? "" });

  return (
    <ITPage
      noPadding
      title={t("list.title")}
      description={t("list.description", { count: fx.total })}
      icon={<FaChalkboardTeacher size={20} />}
      actions={
        <ITFlex gap={2}>
          <ITButton variant="outlined" color="secondary" onClick={fx.reload}>
            <ITFlex align="center" gap={1}><FaSync size={11} /><ITText className="font-bold text-[11px]">{t("common:actions.reload")}</ITText></ITFlex>
          </ITButton>
          {canCreate && (
            <ITButton variant="filled" color="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <ITFlex align="center" gap={1}><FaPlus size={11} /><ITText className="font-bold text-[11px]">{t("list.new")}</ITText></ITFlex>
            </ITButton>
          )}
        </ITFlex>
      }
    >
      <TeachersTable fx={fx} onAction={onAction} />

      <TeacherFormDialog
        isOpen={formOpen}
        teacher={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(saved, created) => {
          setFormOpen(false);
          notify.success(created ? t("form.created", { email: saved.email }) : t("form.saved"));
          fx.reload();
        }}
      />
      <ITConfirmDialog
        isOpen={!!resending}
        onClose={() => setResending(null)}
        onConfirm={() => resending && void run(() => teacherApi.resendInvitation(resending.id), t("resend.done"), () => setResending(null))}
        title={t("resend.title", { name: resending?.nombreCompleto ?? "" })}
        message={t("resend.message")}
        confirmLabel={t("resend.confirm")}
        cancelLabel={t("common:actions.cancel")}
      />
      <ITConfirmDialog
        isOpen={!!reactivating}
        onClose={() => setReactivating(null)}
        onConfirm={() => reactivating && void run(() => teacherApi.reactivate(reactivating.id), t("reactivate.done"), () => setReactivating(null))}
        title={t("reactivate.title", { name: reactivating?.nombreCompleto ?? "" })}
        message={t("reactivate.message")}
        confirmLabel={t("actions.reactivate")}
        cancelLabel={t("common:actions.cancel")}
        variant="success"
      />
      <ITDialog isOpen={!!deactivating} onClose={() => setDeactivating(null)} title={deactivateTitle} className="w-full max-w-lg">
        <div role="dialog" aria-label={deactivateTitle}>
          <ITFlex direction="column" gap={4}>
            <ITText className="text-[12px] text-slate-600">{t("deactivate.message")}</ITText>
            <ITTextarea name="reason" label={t("deactivate.reason")} value={reason} onChange={setReason} rows={3} maxLength={500} />
            <ITFlex justify="end" gap={2}>
              <ITButton variant="outlined" color="secondary" onClick={() => setDeactivating(null)}>{t("common:actions.cancel")}</ITButton>
              <ITButton variant="filled" color="danger"
                onClick={() => deactivating && void run(() => teacherApi.deactivate(deactivating.id, reason.trim() || undefined), t("deactivate.done"), () => setDeactivating(null))}>
                {t("deactivate.confirm")}
              </ITButton>
            </ITFlex>
          </ITFlex>
        </div>
      </ITDialog>
    </ITPage>
  );
}
