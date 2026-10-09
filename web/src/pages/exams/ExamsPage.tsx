import { useCallback, useState } from "react";
import { ITButton, ITFlex, ITPage, ITText } from "@axzydev/axzy_ui_system";
import { FaClipboardCheck, FaPlus } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { ExamsTable } from "@features/exam/exams-list";
import { ExamFormDialog } from "@features/exam/exam-form";

/** `/exams` (M15): exámenes en línea de los grupos del alcance. */
export default function ExamsPage() {
  const { t } = useTranslation(["exams", "common"]);
  const navigate = useNavigate();
  const notify = useNotify();
  const canManage = useCan("exams.manage");
  const [total, setTotal] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const onTotal = useCallback((n: number) => setTotal(n), []);

  return (
    <ITPage
      noPadding
      title={t("exams.title")}
      description={t("exams.description", { count: total })}
      icon={<FaClipboardCheck size={20} />}
      actions={
        canManage && (
          <ITButton variant="filled" color="primary" onClick={() => setFormOpen(true)}>
            <ITFlex align="center" gap={1}><FaPlus size={11} /><ITText className="font-bold text-[11px]">{t("exams.new")}</ITText></ITFlex>
          </ITButton>
        )
      }
    >
      <ExamsTable reloadKey={0} onTotal={onTotal} onOpen={(exam) => navigate(`/exams/${exam.id}`)} />
      <ExamFormDialog
        isOpen={formOpen}
        exam={null}
        onClose={() => setFormOpen(false)}
        onSaved={(exam) => {
          setFormOpen(false);
          notify.success(t("exams.created"));
          navigate(`/exams/${exam.id}`);
        }}
      />
    </ITPage>
  );
}
