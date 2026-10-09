import { useCallback, useState } from "react";
import { ITButton, ITFlex, ITPage, ITText } from "@axzydev/axzy_ui_system";
import { FaPlus, FaStream } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { ProgramsTable } from "@features/programs/programs-list";
import { ProgramFormDialog } from "@features/programs/program-form";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/** `/programs` (M22): catálogo de carreras. */
export default function ProgramsPage() {
  const { t } = useTranslation(["programs", "common"]);
  const crumbs = useBreadcrumbs();
  const navigate = useNavigate();
  const notify = useNotify();
  const canManage = useCan("programs.manage");
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const onTotal = useCallback((n: number) => setTotal(n), []);

  return (
    <ITPage
      breadcrumbs={crumbs({ label: t("common:nav.programs") })}
      noPadding
      title={t("list.title")}
      description={t("list.description", { count: total })}
      icon={<FaStream size={20} />}
      actions={
        canManage && (
          <ITButton variant="filled" color="primary" onClick={() => setFormOpen(true)}>
            <ITFlex align="center" gap={1}><FaPlus size={11} /><ITText className="font-bold text-[11px]">{t("list.new")}</ITText></ITFlex>
          </ITButton>
        )
      }
    >
      <ProgramsTable reloadKey={reloadKey} onTotal={onTotal} onOpen={(program) => navigate(`/programs/${program.id}`)} />
      <ProgramFormDialog
        isOpen={formOpen}
        program={null}
        onClose={() => setFormOpen(false)}
        onSaved={(program) => {
          setFormOpen(false);
          notify.success(t("list.created"));
          setReloadKey((k) => k + 1);
          navigate(`/programs/${program.id}`);
        }}
      />
    </ITPage>
  );
}
