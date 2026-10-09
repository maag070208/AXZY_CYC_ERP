import { useCallback, useEffect, useState } from "react";
import { ITButton, ITFlex, ITPage } from "@axzydev/axzy_ui_system";
import { FaFileSignature } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "@app/toast/useNotify";
import { attemptApi, type Attempt } from "@entities/online-exam";
import { AttemptResult, ExamRunner } from "@features/exam/take-exam";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/** `/exam/:attemptId` (M16): presentar el intento o ver su resultado. */
export default function ExamRunnerPage() {
  const { t } = useTranslation(["exams", "common"]);
  const crumbs = useBreadcrumbs();
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    attemptApi.get(attemptId).then(setAttempt).catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [attemptId, t]);

  const onFinished = useCallback((final: Attempt, wasExpired: boolean) => {
    setAttempt(final);
    setExpired(wasExpired && final.status === "EXPIRED");
  }, []);

  return (
    <ITPage className="m-0! px-4! max-w-screen!" noPadding
      title={attempt?.title ?? t("my.title")}
      description={attempt ? `${attempt.student.name} · #${attempt.number}` : undefined}
      icon={<FaFileSignature size={20} />}
      loading={!attempt && !error}
      error={error}
      backAction={attempt?.status === "IN_PROGRESS" ? undefined : () => navigate("/my-exams")}
      // Durante el intento no hay migas: salir de la pantalla no debe quedar a un clic.
      breadcrumbs={attempt?.status === "IN_PROGRESS" ? undefined : crumbs({ label: t("common:nav.myExams"), to: "/my-exams" }, { label: attempt?.title })}
    >
      {attempt?.status === "IN_PROGRESS" && <ExamRunner key={attempt.attemptId} attempt={attempt} onFinished={onFinished} />}
      {attempt && attempt.status !== "IN_PROGRESS" && (
        <ITFlex direction="column" gap={4}>
          <AttemptResult attempt={attempt} expired={expired} />
          <ITFlex justify="end">
            <ITButton variant="outlined" color="primary" onClick={() => navigate("/my-exams")}>{t("runner.back")}</ITButton>
          </ITFlex>
        </ITFlex>
      )}
    </ITPage>
  );
}
