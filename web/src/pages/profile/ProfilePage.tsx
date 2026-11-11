import { useEffect, useState } from "react";
import { ITAlert, ITBadget, ITFlex, ITLoader, ITPage, ITText } from "@axzydev/axzy_ui_system";
import { FaChalkboardTeacher, FaEnvelope, FaPhone, FaRegClock, FaUsers } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@app/store";
import { errorMessage } from "@app/toast/useNotify";
import { groupApi, WEEK_DAYS, type Group } from "@entities/group";
import { studentApi } from "@entities/student";
import { teacherApi, type Teacher } from "@entities/teacher";
import { formatDay } from "@shared/lib/day";
import { PanelCard } from "@shared/ui/panel-card";
import { useBreadcrumbs } from "@shared/lib/useBreadcrumbs";

/**
 * `Mi Perfil`: el expediente de quien tiene la sesión. El alumno reutiliza la
 * pantalla de alumno (`/students/:id`); el profesor —que no tiene listado propio
 * donde caer— ve su ficha y sus grupos aquí mismo.
 */
export default function ProfilePage() {
  const { t } = useTranslation(["common", "teachers"]);
  const user = useSelector((s: RootState) => s.auth.user);
  const roles = user?.roles ?? (user?.role ? [user.role] : []);
  const isTeacher = roles.includes("TEACHER");
  const isStudent = roles.includes("STUDENT");
  const [to, setTo] = useState<string | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    if (isTeacher) {
      teacherApi
        .me()
        .then(async (me) => {
          if (stale) return;
          setTeacher(me);
          const res = await groupApi.table({ page: 1, limit: 50, filters: { teacherId: me.id } });
          if (!stale) setGroups(res.data);
        })
        .catch((err) => !stale && setError(errorMessage(err, t("errors.load"))));
      return () => {
        stale = true;
      };
    }
    if (isStudent) {
      studentApi
        .me()
        .then((student) => !stale && setTo(`/students/${student.id}`))
        .catch((err) => !stale && setError(errorMessage(err, t("errors.load"))));
    }
    return () => {
      stale = true;
    };
  }, [isStudent, isTeacher, t]);

  if (error) return <ITAlert variant="error">{error}</ITAlert>;
  if (to) return <Navigate to={to} replace />;
  if (!isTeacher) return <ITAlert variant="info">{t("teachers:profile.notStaff")}</ITAlert>;
  if (!teacher) return <ITLoader />;
  return <TeacherProfile teacher={teacher} groups={groups} />;
}

/** Día → clave de i18n (literal, para el tipado estricto del namespace common). */
const DAY_LABEL = {
  MONDAY: "days.MONDAY",
  TUESDAY: "days.TUESDAY",
  WEDNESDAY: "days.WEDNESDAY",
  THURSDAY: "days.THURSDAY",
  FRIDAY: "days.FRIDAY",
  SATURDAY: "days.SATURDAY",
  SUNDAY: "days.SUNDAY",
} as const;

/** Ficha del profesor con sus grupos, materias y horario. */
function TeacherProfile({ teacher, groups }: { teacher: Teacher; groups: Group[] }) {
  const { t, i18n } = useTranslation(["teachers", "common"]);
  const crumbs = useBreadcrumbs();
  const courses = [...new Set(groups.map((group) => group.courseName))];
  const slots = groups.flatMap((group) =>
    group.schedule.map((slot) => ({ ...slot, groupName: group.name, courseName: group.courseName, termName: group.termName }))
  );

  return (
    <ITPage
      className="m-0! px-4! max-w-screen!"
      noPadding
      breadcrumbs={crumbs({ label: t("common:nav.myProfile") })}
      title={t("teachers:profile.title")}
      description={t("teachers:profile.description")}
      icon={<FaChalkboardTeacher size={20} />}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div>
          <PanelCard title={t("teachers:profile.data")}>
            <div className="flex flex-col gap-3">
              <div>
                <ITText className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">{t("teachers:table.name")}</ITText>
                <ITText className="text-[15px] font-black text-slate-800">{teacher.fullName}</ITText>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="flex items-center gap-2 text-[12px] text-slate-600"><FaEnvelope size={11} className="text-slate-400" />{teacher.email}</span>
                {teacher.phone && (
                  <span className="flex items-center gap-2 text-[12px] text-slate-600"><FaPhone size={11} className="text-slate-400" />{teacher.phone}</span>
                )}
              </div>
              <ITFlex gap={2} align="center">
                <ITBadget color={teacher.status === "ACTIVE" ? "success" : "secondary"} size="sm">
                  {teacher.status === "ACTIVE" ? t("teachers:status.ACTIVE") : t("teachers:status.INACTIVE")}
                </ITBadget>
                {teacher.specialty && <ITBadget color="primary" size="sm">{teacher.specialty}</ITBadget>}
              </ITFlex>
              {teacher.account && (
                <ITText className="text-[11px] text-slate-400">
                  {t("teachers:profile.account", { username: teacher.account.username })}
                </ITText>
              )}
            </div>
          </PanelCard>
        </div>

        <div className="lg:col-span-2">
          <PanelCard title={t("teachers:profile.groups")} description={t("teachers:profile.groupsHint", { count: groups.length, courses: courses.length })}>
            {groups.length === 0 ? (
              <p className="text-[12px] text-slate-500">{t("teachers:profile.noGroups")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100" data-role="teacher-groups">
                {groups.map((group) => (
                  <li key={group.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold text-slate-700">{group.courseName}</span>
                      <span className="block text-[10px] text-slate-500">{group.name} · {group.termName}</span>
                    </span>
                    <span className="flex items-center gap-3 text-[11px] text-slate-600">
                      <span className="flex items-center gap-1"><FaUsers size={10} className="text-slate-400" />{t("teachers:profile.enrolled", { count: group.enrolledCount, capacity: group.capacity })}</span>
                      {group.activeTerm && <ITBadget color="success" size="sm">{t("teachers:profile.currentTerm")}</ITBadget>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PanelCard>
        </div>
        </div>

        <div>
          <PanelCard title={t("teachers:profile.schedule")}>
            {slots.length === 0 ? (
              <p className="text-[12px] text-slate-500">{t("teachers:profile.noSchedule")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {WEEK_DAYS.filter((day) => slots.some((slot) => slot.day === day)).map((day) => (
                  <section key={day} className="flex flex-col gap-1.5">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t(DAY_LABEL[day])}</h3>
                    {slots.filter((slot) => slot.day === day).map((slot, index) => (
                      <div key={`${day}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-semibold text-slate-700">{slot.courseName}</span>
                          <span className="block text-[10px] text-slate-500">{slot.groupName}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold tabular-nums text-slate-600">
                          <FaRegClock size={10} className="text-slate-400" />{slot.startTime} – {slot.endTime}
                        </span>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </PanelCard>
        </div>
      </div>

      <p className="mt-3 text-right text-[11px] text-slate-400">
        {t("teachers:profile.footer", { date: formatDay(new Date().toISOString().slice(0, 10), i18n.language) })}
      </p>
    </ITPage>
  );
}
