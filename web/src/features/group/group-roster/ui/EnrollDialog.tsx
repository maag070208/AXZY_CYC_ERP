import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDialog, ITFlex, ITInput, ITText } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { enrollmentApi, groupApi, type Enrollment, type Group } from "@entities/group";
import { studentApi, type Student } from "@entities/student";
import { errorMessage } from "@app/toast/useNotify";

interface Props {
  group: Group | null;
  onClose: () => void;
  onEnrolled: (enrollment: Enrollment) => void;
}

/** Busca alumnos activos por nombre o matrícula y los inscribe al grupo. */
export default function EnrollDialog({ group, onClose, onEnrolled }: Props) {
  const { t } = useTranslation(["courses", "common"]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!group) return;
    setQuery("");
    setResults([]);
    setError(null);
    // Quien ya está en el grupo (no en baja) aparece marcado en la búsqueda.
    enrollmentApi
      .table({ page: 1, limit: 200, filters: { groupId: group.id } })
      .then((res) => setEnrolled(new Set(res.data.filter((e) => e.status !== "WITHDRAWN").map((e) => e.studentId))))
      .catch(() => setEnrolled(new Set()));
  }, [group]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      const byStudentNumber = /^\d/.test(term);
      studentApi
        .table({ page: 1, limit: 10, filters: { status: "ACTIVE", ...(byStudentNumber ? { studentNumber: term } : { name: term }) } })
        .then((res) => setResults(res.data))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const enroll = async (student: Student) => {
    if (!group) return;
    setBusy(student.id);
    setError(null);
    try {
      onEnrolled(await groupApi.enroll(group.id, student.id));
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setBusy(null);
    }
  };

  const title = t("enrollments.enrollTitle", { group: group ? `${group.courseName} ${group.name}` : "" });
  return (
    <ITDialog isOpen={!!group} onClose={onClose} title={title} className="w-full max-w-xl">
      <div role="dialog" aria-label={title}>
        <ITFlex direction="column" gap={3}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITInput name="studentSearch" label={t("enrollments.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query.trim().length < 2 ? (
            <ITText className="text-[11px] text-slate-400">{t("enrollments.searchHint")}</ITText>
          ) : results.length === 0 ? (
            <ITText className="text-[12px] text-slate-500">{t("enrollments.noResults")}</ITText>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" data-role="student-results">
              {results.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <ITText className="block text-[12px] font-bold text-slate-700">{s.fullName}</ITText>
                    <ITText className="font-mono text-[11px] text-slate-400">{s.studentNumber}</ITText>
                  </div>
                  {enrolled.has(s.id) ? (
                    <ITText className="text-[11px] font-bold text-slate-400">{t("enrollments.alreadyEnrolled")}</ITText>
                  ) : (
                    <ITButton variant="filled" color="primary" size="sm" disabled={busy !== null}
                      ariaLabel={`${t("enrollments.enrollAction")} ${s.fullName}`} onClick={() => void enroll(s)}>
                      {t("enrollments.enrollAction")}
                    </ITButton>
                  )}
                </li>
              ))}
            </ul>
          )}
          <ITFlex justify="end">
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.close")}</ITButton>
          </ITFlex>
        </ITFlex>
      </div>
    </ITDialog>
  );
}
