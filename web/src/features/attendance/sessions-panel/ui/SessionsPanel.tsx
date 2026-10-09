import { useCallback, useEffect, useState } from "react";
import { ITAlert, ITBadget, ITButton, ITFlex, ITLoader, ITTable, ITText } from "@axzydev/axzy_ui_system";
import type { Column } from "@axzydev/axzy_ui_system";
import { FaBan, FaClipboardList, FaPlus } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { useCan } from "@entities/user";
import { attendanceApi, type AttendanceSession } from "@entities/attendance";
import { formatDay } from "@shared/lib/day";
import { ReasonDialog } from "@shared/ui/reason-dialog";
import { PanelCard } from "@shared/ui/panel-card";
import SessionFormDialog from "./SessionFormDialog";
import RollCallDialog from "./RollCallDialog";

interface Props {
  groupId: string;
  /** Grupo cerrado o inactivo: solo lectura. */
  readOnly: boolean;
  reloadKey: number;
  onChanged: () => void;
}

/** Sesiones de asistencia de un grupo con pase de lista y anulación (M18). */
export default function SessionsPanel({ groupId, readOnly, reloadKey, onChanged }: Props) {
  const { t, i18n } = useTranslation(["attendance", "common"]);
  const notify = useNotify();
  const canManage = useCan("attendance.manage");
  const canView = useCan("attendance.view");
  const writable = canManage && !readOnly;

  const [sessions, setSessions] = useState<AttendanceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [rollId, setRollId] = useState<string | null>(null);
  const [annulling, setAnnulling] = useState<AttendanceSession | null>(null);

  const load = useCallback(() => {
    if (!canView) return;
    attendanceApi
      .listSessions(groupId)
      .then((rows) => {
        setSessions(rows);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err, t("common:errors.load"))));
  }, [groupId, canView, t]);

  useEffect(load, [load, reloadKey, reload]);

  const refresh = () => {
    setReload((n) => n + 1);
    onChanged();
  };

  const columns: Column<AttendanceSession>[] = [
    {
      key: "date", label: t("sessions.fecha"), type: "string", width: 170,
      render: (s) => (
        <div>
          <ITText className="block text-[12px] font-bold text-slate-700">{formatDay(s.date, i18n.language)}</ITText>
          {s.time && <ITText className="text-[10px] text-slate-400">{s.time}</ITText>}
        </div>
      ),
    },
    { key: "topic", label: t("sessions.tema"), type: "string", render: (s) => <ITText className="text-[12px] text-slate-600">{s.topic ?? "—"}</ITText> },
    {
      key: "registrados", label: t("sessions.registrados"), type: "number", width: 130,
      render: (s) => <ITText className="text-[12px] text-slate-600">{s.registrados} · {t("sessions.faltasCount", { count: s.faltas })}</ITText>,
    },
    {
      key: "status", label: t("sessions.estado"), type: "string", width: 120,
      render: (s) => (s.annulled ? <ITBadget color="danger" size="sm">{t("sessions.anulada")}</ITBadget> : <ITBadget color="success" size="sm">{t("sessions.vigente")}</ITBadget>),
    },
    {
      key: "actions", label: t("common:labels.actions"), type: "actions", width: 170,
      actions: (s) => (
        <ITFlex gap={1}>
          {canView && !s.annulled && (
            <ITButton variant="text" color="primary" size="sm" ariaLabel={`${t("sessions.passList")} ${s.date}`} onClick={() => setRollId(s.id)}>
              <FaClipboardList size={13} />
            </ITButton>
          )}
          {writable && !s.annulled && (
            <ITButton variant="text" color="danger" size="sm" ariaLabel={`${t("sessions.annul")} ${s.date}`} onClick={() => setAnnulling(s)}>
              <FaBan size={12} />
            </ITButton>
          )}
        </ITFlex>
      ),
    },
  ];

  if (!canView) return null;

  return (
    <PanelCard
      title={t("sessions.title")}
      description={t("sessions.description")}
      actions={
        writable && (
          <ITButton variant="filled" color="primary" onClick={() => setFormOpen(true)}>
            <ITFlex align="center" gap={1}><FaPlus size={11} /><ITText className="text-[11px] font-bold">{t("sessions.new")}</ITText></ITFlex>
          </ITButton>
        )
      }
    >
      {error && <ITAlert variant="error">{error}</ITAlert>}
      {!sessions && !error && <ITLoader />}
      {sessions && sessions.length === 0 ? (
        <ITText className="block text-[12px] text-slate-500">{t("sessions.empty")}</ITText>
      ) : (
        sessions && (
          <ITTable
            columns={columns as unknown as Column<Record<string, unknown>>[]}
            data={sessions as unknown as Record<string, unknown>[]}
            defaultItemsPerPage={10}
            density="compact"
          />
        )
      )}

      <SessionFormDialog
        isOpen={formOpen}
        groupId={groupId}
        onClose={() => setFormOpen(false)}
        onSaved={(session) => {
          setFormOpen(false);
          notify.success(t("sessions.created"));
          setRollId(session.id);
          refresh();
        }}
      />

      <RollCallDialog sessionId={rollId} onClose={() => setRollId(null)} onSaved={() => { setRollId(null); refresh(); }} />

      <ReasonDialog
        isOpen={!!annulling}
        title={t("sessions.annulTitle")}
        message={t("sessions.annulHint")}
        label={t("sessions.annulMotivo")}
        confirmLabel={t("sessions.annul")}
        cancelLabel={t("common:actions.cancel")}
        requiredMessage={t("common:validation.minLength", { label: t("sessions.annulMotivo"), min: 3 })}
        onClose={() => setAnnulling(null)}
        onConfirm={async (reason) => {
          const session = annulling;
          if (!session) return;
          try {
            await attendanceApi.annul(session.id, reason);
            setAnnulling(null);
            notify.success(t("sessions.annulled"));
            refresh();
          } catch (err) {
            notify.error(errorMessage(err, t("common:errors.save")));
          }
        }}
      />
    </PanelCard>
  );
}
