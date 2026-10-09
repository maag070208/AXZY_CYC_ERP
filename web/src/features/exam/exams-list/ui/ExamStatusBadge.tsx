import { ITBadget } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import type { ExamStatus } from "@entities/online-exam";

const COLORS: Record<ExamStatus, "secondary" | "success" | "danger"> = {
  BORRADOR: "secondary",
  PUBLICADO: "success",
  CERRADO: "danger",
};

export default function ExamStatusBadge({ status }: { status: ExamStatus }) {
  const { t } = useTranslation("exams");
  return <ITBadget color={COLORS[status]} size="sm">{t(`exams.statuses.${status}`)}</ITBadget>;
}
