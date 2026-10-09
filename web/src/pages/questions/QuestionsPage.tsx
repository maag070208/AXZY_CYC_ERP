import { useCallback, useState } from "react";
import { ITButton, ITFlex, ITPage, ITText } from "@axzydev/axzy_ui_system";
import { FaFileImport, FaPlus, FaQuestionCircle } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { questionApi, type Question } from "@entities/question";
import { QuestionsTable, type QuestionAction } from "@features/question/questions-list";
import { QuestionFormDialog } from "@features/question/question-form";
import { ImportQuestionsDialog } from "@features/question/import-questions";

/** `/questions` (M14): banco de reactivos. */
export default function QuestionsPage() {
  const { t } = useTranslation(["exams", "common"]);
  const notify = useNotify();
  const canCreate = useCan("questions.create");
  const canImport = useCan("questions.import");
  const [reloadKey, setReloadKey] = useState(0);
  const [total, setTotal] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const reload = () => setReloadKey((k) => k + 1);
  const onTotal = useCallback((n: number) => setTotal(n), []);

  const onAction = async (action: QuestionAction, question: Question) => {
    if (action === "edit") {
      setEditing(question);
      setFormOpen(true);
      return;
    }
    try {
      if (action === "deactivate") await questionApi.deactivate(question.id);
      else await questionApi.reactivate(question.id);
      notify.success(action === "deactivate" ? t("questions.deactivated") : t("questions.reactivated"));
      reload();
    } catch (err) {
      notify.error(errorMessage(err, t("common:errors.save")));
    }
  };

  return (
    <ITPage
      noPadding
      title={t("questions.title")}
      description={t("questions.description", { count: total })}
      icon={<FaQuestionCircle size={20} />}
      actions={
        <ITFlex gap={2}>
          {canImport && (
            <ITButton variant="outlined" color="primary" onClick={() => setImportOpen(true)}>
              <ITFlex align="center" gap={1}><FaFileImport size={11} /><ITText className="font-bold text-[11px]">{t("questions.import")}</ITText></ITFlex>
            </ITButton>
          )}
          {canCreate && (
            <ITButton variant="filled" color="primary" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <ITFlex align="center" gap={1}><FaPlus size={11} /><ITText className="font-bold text-[11px]">{t("questions.new")}</ITText></ITFlex>
            </ITButton>
          )}
        </ITFlex>
      }
    >
      <QuestionsTable reloadKey={reloadKey} onTotal={onTotal} onAction={(a, q) => void onAction(a, q)} />
      <QuestionFormDialog
        isOpen={formOpen}
        question={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(_, created) => {
          setFormOpen(false);
          notify.success(created ? t("questions.created") : t("questions.saved"));
          reload();
        }}
      />
      <ImportQuestionsDialog
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(result) => {
          setImportOpen(false);
          notify.success(t("questions.imported", { count: result.created }));
          reload();
        }}
      />
    </ITPage>
  );
}
