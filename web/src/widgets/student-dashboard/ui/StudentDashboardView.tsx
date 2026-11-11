import { ITAlert, ITBadget, ITButton, ITLoader } from "@axzydev/axzy_ui_system";
import {
  FaBookOpen,
  FaCalendarAlt,
  FaCheckCircle,
  FaClipboardList,
  FaExclamationTriangle,
  FaFileAlt,
  FaMoneyBillWave,
  FaRegClock,
} from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { StudentDashboard, StudentSubjectRow } from "@entities/report";
import { formatDay, formatInstant } from "@shared/lib/day";
import { formatMoney } from "@shared/lib/money";
import { KpiTile } from "@shared/ui/kpi-tile";
import { PanelCard } from "@shared/ui/panel-card";
import { useStudentDashboard } from "./useStudentDashboard";

const EMPTY = "—";
const MAX_CHARGES = 5;
const MAX_SUBJECTS = 6;

type SubjectStatus = StudentSubjectRow["status"];

/** Día del horario → clave de i18n (tipada, sin plantillas dinámicas). */
const DAY_KEYS: Record<string, "days.MONDAY" | "days.TUESDAY" | "days.WEDNESDAY" | "days.THURSDAY" | "days.FRIDAY" | "days.SATURDAY" | "days.SUNDAY"> = {
  MONDAY: "days.MONDAY",
  TUESDAY: "days.TUESDAY",
  WEDNESDAY: "days.WEDNESDAY",
  THURSDAY: "days.THURSDAY",
  FRIDAY: "days.FRIDAY",
  SATURDAY: "days.SATURDAY",
  SUNDAY: "days.SUNDAY",
};

/** Estado de la materia → etiqueta y color del distintivo. */
const STATUS_TONE: Record<SubjectStatus, "success" | "danger" | "primary" | "secondary"> = {
  PASSED: "success",
  FAILED: "danger",
  IN_PROGRESS: "primary",
  WITHDRAWN: "secondary",
};

/** Estado de la materia → clave de i18n (tipada). */
const SUBJECT_STATUS_KEYS: Record<SubjectStatus, "subjectStatus.PASSED" | "subjectStatus.FAILED" | "subjectStatus.IN_PROGRESS" | "subjectStatus.WITHDRAWN"> = {
  PASSED: "subjectStatus.PASSED",
  FAILED: "subjectStatus.FAILED",
  IN_PROGRESS: "subjectStatus.IN_PROGRESS",
  WITHDRAWN: "subjectStatus.WITHDRAWN",
};

/**
 * Inicio del alumno (M21): su ciclo de un vistazo —exámenes por presentar,
 * pagos, horario, avance académico, expediente y avisos—. Todo lo calcula el
 * backend con su alcance `OWN`; aquí solo se pinta.
 */
export default function StudentDashboardView() {
  const { t, i18n } = useTranslation(["student", "common"]);
  const navigate = useNavigate();
  const { data, error, loading, notAStudent, retry } = useStudentDashboard();
  const locale = i18n.language;
  const money = (value: number) => formatMoney(value, locale);

  if (notAStudent) return null;
  if (error) {
    return (
      <ITAlert variant="error">
        <div className="flex items-center justify-between gap-3">
          <span>{error}</span>
          <ITButton variant="outlined" color="secondary" onClick={retry}>
            {t("common:actions.reload")}
          </ITButton>
        </div>
      </ITAlert>
    );
  }
  if (loading && !data) return <ITLoader />;
  if (!data) return null;

  const { student, groups, exams, payments, academic, documents, notifications } = data;

  /** Horario de la semana, en orden y sin repetir día. */
  const schedule = groups.flatMap((group) =>
    group.schedule.map((slot) => ({ ...slot, courseName: group.courseName, groupName: group.groupName, teacherName: group.teacherName, classroom: group.classroom }))
  );
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
  const byDay = days
    .map((day) => ({ day, slots: schedule.filter((slot) => slot.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime)) }))
    .filter((row) => row.slots.length > 0);

  const pendingCharges = (payments?.pending ?? []).slice(0, MAX_CHARGES);
  const subjects = (academic?.subjects ?? []).slice(0, MAX_SUBJECTS);
  const overdueCharges = (payments?.pending ?? []).filter((charge) => charge.overdue);

  const kpis: Array<{ label: string; value: string; icon: React.ReactNode; tone: "sky" | "emerald" | "violet" | "rose" | "amber"; delta?: string; hint?: string; onClick?: () => void }> = [];
  if (exams) {
    kpis.push({
      label: t("home.exams"),
      value: String(exams.toTake),
      icon: <FaClipboardList size={18} />,
      tone: exams.toTake > 0 ? "amber" : "sky",
      delta:
        exams.next?.state === "OPEN" || exams.next?.inProgressAttemptId
          ? t("home.examOpen", { closesAt: formatInstant(exams.next.closesAt, locale) })
          : exams.next
            ? t("home.examOpens", { opensAt: formatInstant(exams.next.opensAt, locale) })
            : t("home.noExams"),
      hint: exams.upcoming > 0 ? t("home.examsUpcoming", { count: exams.upcoming }) : undefined,
      onClick: () => navigate("/my-exams"),
    });
  }
  if (payments) {
    kpis.push({
      label: t("home.balance"),
      value: money(payments.balance),
      icon: <FaMoneyBillWave size={18} />,
      tone: payments.overdue > 0 ? "rose" : payments.balance > 0 ? "amber" : "emerald",
      delta:
        payments.overdue > 0
          ? t("home.overdue", { amount: money(payments.overdue) })
          : payments.balance > 0
            ? t("home.nextDue", { date: formatDay(pendingCharges[0]?.dueDate ?? null, locale) })
            : t("home.upToDate"),
      hint: t("home.chargesPending", { count: payments.pending.length }),
    });
  }
  if (academic) {
    kpis.push({
      label: t("home.average"),
      value: academic.overallAverage === null ? EMPTY : String(academic.overallAverage),
      icon: <FaBookOpen size={18} />,
      tone: "violet",
      delta: academic.overallAverage === null ? t("home.noGrades") : t("home.averageHint", { count: academic.subjects.length }),
    });
    kpis.push({
      label: t("home.attendance"),
      value: academic.attendanceRate === null ? EMPTY : `${academic.attendanceRate}%`,
      icon: <FaRegClock size={18} />,
      tone: academic.attendanceRate === null ? "sky" : academic.attendanceRate >= 80 ? "emerald" : "amber",
      delta: academic.attendanceRate === null ? t("home.noAttendance") : t("home.attendanceHint"),
    });
  }

  return (
    <div className="flex flex-col gap-4" data-role="student-dashboard">
      {/* 1. Indicadores */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-role="student-kpis">
        {kpis.map((kpi) => (
          <KpiTile
            key={kpi.label}
            layout="statement"
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            tone={kpi.tone}
            delta={kpi.delta}
            hint={kpi.hint}
            {...(kpi.onClick ? { onClick: kpi.onClick } : {})}
          />
        ))}
      </div>

      {/* 2. Mis pagos + mi horario */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {payments && (
          <PanelCard title={t("home.payments")} description={t("home.paymentsHint")}>
            {pendingCharges.length === 0 ? (
              <p className="flex items-center gap-2 text-[12px] text-emerald-700">
                <FaCheckCircle size={13} />
                {t("home.noCharges")}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <ul className="flex flex-col divide-y divide-slate-100">
                  {pendingCharges.map((charge) => (
                    <li key={charge.id} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-semibold text-slate-700">{charge.description ?? charge.concept}</span>
                        <span className="block text-[10px] text-slate-500">{formatDay(charge.dueDate, locale)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {charge.overdue && <ITBadget color="danger" size="sm">{t("home.overdueBadge")}</ITBadget>}
                        <span className="text-[12px] font-bold tabular-nums text-slate-800">{money(charge.balance)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="flex items-center justify-between border-t border-slate-100 pt-3 text-[12px]">
                  <span className="font-semibold text-slate-500">{t("home.balance")}</span>
                  <span className="font-bold tabular-nums text-slate-800">{money(payments.balance)}</span>
                </p>
                {overdueCharges.length > 0 && (
                  <p className="flex items-center gap-2 text-[11px] text-rose-600">
                    <FaExclamationTriangle size={11} />
                    {t("home.overdueNote", { count: overdueCharges.length })}
                  </p>
                )}
              </div>
            )}
          </PanelCard>
        )}

        <div className={payments ? "xl:col-span-2" : "xl:col-span-3"}>
          <PanelCard title={t("home.schedule")} description={t("home.scheduleHint", { count: groups.length })}>
            {groups.length === 0 ? (
              <p className="text-[12px] text-slate-500">{t("home.noGroups")}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {byDay.length === 0 ? (
                  <p className="text-[12px] text-slate-500">{t("home.noSchedule")}</p>
                ) : (
                  byDay.map((row) => (
                    <section key={row.day} className="flex flex-col gap-1.5">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t(DAY_KEYS[row.day] ?? "days.MONDAY")}</h3>
                      <ul className="flex flex-col gap-1.5">
                        {row.slots.map((slot, index) => (
                          <li
                            key={`${row.day}-${slot.groupName}-${slot.courseName}-${index}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <FaCalendarAlt size={11} className="text-slate-400" />
                              <span className="truncate text-[12px] font-semibold text-slate-700">{slot.courseName}</span>
                              <span className="truncate text-[10px] text-slate-500">{slot.groupName}</span>
                            </span>
                            <span className="flex items-center gap-3 text-[11px] tabular-nums text-slate-600">
                              {slot.teacherName && <span className="hidden sm:inline">{slot.teacherName}</span>}
                              {slot.classroom && <span>{t("home.classroom", { name: slot.classroom })}</span>}
                              <span className="font-bold">{slot.startTime} – {slot.endTime}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            )}
          </PanelCard>
        </div>
      </div>

      {/* 3. Mi avance + avisos y expediente */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {academic && (
          <div className="xl:col-span-2">
            <PanelCard title={t("home.progress")} description={t("home.progressHint")}>
              {subjects.length === 0 ? (
                <p className="text-[12px] text-slate-500">{t("home.noSubjects")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {subjects.map((subject) => (
                    <li
                      key={`${subject.courseName}-${subject.groupName}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-semibold text-slate-700">{subject.courseName}</span>
                        <span className="block text-[10px] text-slate-500">{subject.groupName}</span>
                      </span>
                      <span className="flex items-center gap-3">
                        <ITBadget color={STATUS_TONE[subject.status]} size="sm">
                          {t(SUBJECT_STATUS_KEYS[subject.status])}
                        </ITBadget>
                        <span className="w-16 text-right text-[12px] font-bold tabular-nums text-slate-800">
                          {subject.average === null ? EMPTY : subject.average}
                        </span>
                        <span className="w-16 text-right text-[11px] tabular-nums text-slate-500">
                          {subject.attendanceRate === null ? EMPTY : `${subject.attendanceRate}%`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {notifications && (
            <PanelCard
              title={t("home.notices")}
              description={notifications.unread > 0 ? t("home.unread", { count: notifications.unread }) : undefined}
              actions={
                <ITButton variant="text" color="primary" className="!p-0!" onClick={() => navigate("/notifications")}>
                  {t("home.seeAll")}
                </ITButton>
              }
            >
              {notifications.latest.length === 0 ? (
                <p className="text-[12px] text-slate-500">{t("home.noNotices")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-slate-100">
                  {notifications.latest.map((notice) => (
                    <li key={notice.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                      <span className="flex items-center gap-2">
                        {!notice.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden />}
                        <span className="truncate text-[12px] font-semibold text-slate-700">{notice.subject ?? t("home.notice")}</span>
                      </span>
                      <span className="line-clamp-2 text-[11px] text-slate-500">{notice.body}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>
          )}

          {documents && (
            <PanelCard title={t("home.documents")}>
              {documents.missing.length === 0 ? (
                <p className="flex items-center gap-2 text-[12px] text-emerald-700">
                  <FaCheckCircle size={13} />
                  {t("home.documentsComplete")}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="flex items-center gap-2 text-[12px] font-semibold text-amber-700">
                    <FaFileAlt size={12} />
                    {t("home.documentsMissing", { count: documents.missing.length })}
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {documents.missing.map((doc) => (
                      <li key={doc.id}>
                        <ITBadget color="warning" size="sm">{doc.name}</ITBadget>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </PanelCard>
          )}
        </div>
      </div>

      <p className="text-right text-[11px] text-slate-400">
        {t("home.footer", {
          number: student.studentNumber,
          level: student.levelName ?? EMPTY,
          date: new Date(data.generatedAt).toLocaleString(locale),
        })}
      </p>
    </div>
  );
}

export type { StudentDashboard };
