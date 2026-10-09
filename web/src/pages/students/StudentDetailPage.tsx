import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ITBadget, ITButton, ITFlex, ITGrid, ITPage, ITTabs, ITText } from "@axzydev/axzy_ui_system";
import { FaEdit, FaUndo, FaUserGraduate, FaUserSlash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { studentApi, type MovementType, type Student } from "@entities/student";
import { MovementDialog } from "@features/student/movement-dialog";
import { MovementsList } from "@features/student/movements-list";
import { DocumentsPanel } from "@features/document/documents-panel";
import { EnrollmentsTable } from "@features/group/group-roster";
import { StudentAttendancePanel } from "@features/attendance/student-attendance";
import { KardexView } from "@widgets/kardex-pdf";
import { AccountStatementView } from "@widgets/account-statement";
import { PanelCard } from "@shared/ui/panel-card";
import { formatDay } from "@shared/lib/day";

const ageOf = (birth: string): number => {
  const [y, m, d] = birth.split("-").map(Number);
  const now = new Date();
  return now.getFullYear() - y - (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d) ? 1 : 0);
};

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <ITText className="block text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</ITText>
      <ITText className="text-[13px] text-slate-700">{value || "—"}</ITText>
    </div>
  );
}

/** `/students/:id`: expediente del alumno con pestañas (datos, movimientos, documentos, kardex). */
export default function StudentDetailPage() {
  const { t, i18n } = useTranslation(["students", "common"]);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notify = useNotify();
  const canEdit = useCan("students.edit");
  const canMove = useCan("students.movements");
  const canDocuments = useCan("documents.view");
  const canKardex = useCan("kardex.view");
  const canEnrollments = useCan("enrollments.view");
  const canAccount = useCan("charges.view");
  const canAttendance = useCan("attendance.view");
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [movement, setMovement] = useState<MovementType | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(() => {
    if (!id) return;
    studentApi
      .get(id)
      .then((s) => {
        setStudent(s);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [id, t]);

  useEffect(load, [load, reloadKey]);

  const s = student;
  const general = s && (
    <ITFlex direction="column" gap={4}>
      <PanelCard title={t("form.personal")}>
        <ITGrid container columns={12} spacing={4}>
          <ITGrid item xs={12} md={4}><Field label={t("form.curp")} value={<span className="font-mono">{s.curp}</span>} /></ITGrid>
          <ITGrid item xs={12} md={4}>
            <Field label={t("form.fechaNacimiento")}
              value={`${formatDay(s.fechaNacimiento, i18n.language)} · ${t("detail.age", { age: ageOf(s.fechaNacimiento) })}`} />
          </ITGrid>
          <ITGrid item xs={12} md={4}><Field label={t("form.genero")} value={s.genero ? t(`genders.${s.genero}`) : null} /></ITGrid>
          <ITGrid item xs={12} md={4}><Field label={t("form.fechaIngreso")} value={formatDay(s.fechaIngreso, i18n.language)} /></ITGrid>
          <ITGrid item xs={12} md={4}><Field label={t("form.email")} value={s.email} /></ITGrid>
          <ITGrid item xs={12} md={4}><Field label={t("form.telefono")} value={s.telefono} /></ITGrid>
          <ITGrid item xs={12}><Field label={t("form.direccion")} value={s.direccion} /></ITGrid>
        </ITGrid>
      </PanelCard>
      <PanelCard title={t("form.guardians")}>
        {s.guardians.length === 0 ? (
          <ITText className="text-[12px] text-slate-500">{t("form.noGuardians")}</ITText>
        ) : (
          <ITFlex direction="column" gap={2}>
            {s.guardians.map((g) => (
              <ITFlex key={g.id} justify="between" align="center" className="rounded-xl border border-slate-200 px-3 py-2">
                <div>
                  <ITText className="block text-[12px] font-black text-slate-700">{g.nombre}</ITText>
                  <ITText className="text-[11px] text-slate-500">
                    {g.parentesco} · {g.telefono}{g.email ? ` · ${g.email}` : ""}
                  </ITText>
                </div>
                {g.esResponsablePago && <ITBadget color="warning" size="sm">{t("form.responsablePago")}</ITBadget>}
              </ITFlex>
            ))}
          </ITFlex>
        )}
      </PanelCard>
    </ITFlex>
  );

  return (
    <ITPage
      title={s?.nombreCompleto ?? t("list.title")}
      description={s ? `${t("detail.matricula")} ${s.matricula}` : undefined}
      icon={<FaUserGraduate size={20} />}
      loading={!s && !error}
      error={error}
      backAction={() => navigate("/students")}
      actions={
        s && (
          <ITFlex gap={2} align="center">
            <ITBadget color={s.status === "ACTIVO" ? "success" : "danger"} size="lg">{t(`status.${s.status}`)}</ITBadget>
            {canEdit && (
              <ITButton variant="outlined" color="primary" onClick={() => navigate(`/students/${s.id}/edit`)}>
                <ITFlex align="center" gap={1}><FaEdit size={11} /><ITText className="text-[11px] font-bold">{t("detail.edit")}</ITText></ITFlex>
              </ITButton>
            )}
            {canMove && s.status === "ACTIVO" && (
              <ITButton variant="outlined" color="danger" onClick={() => setMovement("BAJA")}>
                <ITFlex align="center" gap={1}><FaUserSlash size={11} /><ITText className="text-[11px] font-bold">{t("detail.baja")}</ITText></ITFlex>
              </ITButton>
            )}
            {canMove && s.status === "BAJA" && (
              <ITButton variant="outlined" color="success" onClick={() => setMovement("REINGRESO")}>
                <ITFlex align="center" gap={1}><FaUndo size={11} /><ITText className="text-[11px] font-bold">{t("detail.reingreso")}</ITText></ITFlex>
              </ITButton>
            )}
          </ITFlex>
        )
      }
    >
      {s && (
        <ITTabs
          items={[
            { id: "general", label: t("detail.tabs.general"), content: general },
            ...(canMove
              ? [{ id: "movements", label: t("detail.tabs.movements"), content: <MovementsList studentId={s.id} reloadKey={reloadKey} /> }]
              : []),
            ...(canDocuments
              ? [{ id: "documents", label: t("detail.tabs.documents"), content: <DocumentsPanel studentId={s.id} readOnly={s.status === "BAJA"} /> }]
              : []),
            ...(canEnrollments
              ? [{ id: "enrollments", label: t("detail.tabs.enrollments"), content: <EnrollmentsTable filter={{ studentId: s.id }} reloadKey={reloadKey} /> }]
              : []),
            ...(canAttendance
              ? [{ id: "attendance", label: t("detail.tabs.attendance"), content: <StudentAttendancePanel studentId={s.id} studentName={s.nombreCompleto} readOnly={s.status === "BAJA"} /> }]
              : []),
            ...(canAccount
              ? [{ id: "account", label: t("detail.tabs.account"), content: <AccountStatementView key={reloadKey} studentId={s.id} /> }]
              : []),
            ...(canKardex
              ? [{ id: "kardex", label: t("detail.tabs.kardex"), content: <KardexView key={reloadKey} studentId={s.id} /> }]
              : []),
          ]}
        />
      )}
      {s && (
        <MovementDialog
          kind={movement}
          student={s}
          onClose={() => setMovement(null)}
          onDone={(result) => {
            setMovement(null);
            notify.success(result.status === "BAJA" ? t("movements.bajaDone") : t("movements.reingresoDone"));
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </ITPage>
  );
}
