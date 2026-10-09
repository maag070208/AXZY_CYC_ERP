import { useEffect, useState } from "react";
import { ITPage } from "@axzydev/axzy_ui_system";
import { FaUserGraduate } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { studentApi, type Student } from "@entities/student";
import { StudentForm } from "@features/student/student-form";

/** `/students/new` y `/students/:id/edit`. */
export default function StudentFormPage() {
  const { t } = useTranslation(["students", "common"]);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notify = useNotify();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    studentApi
      .get(id)
      .then(setStudent)
      .catch((err) => setError(errorMessage(err, t("common:errors.load"))))
      .finally(() => setLoading(false));
  }, [id, t]);

  return (
    <ITPage
      title={id ? t("form.titleEdit") : t("form.titleNew")}
      description={student ? `${student.matricula} · ${student.nombreCompleto}` : undefined}
      icon={<FaUserGraduate size={20} />}
      loading={loading}
      error={error}
      backAction={() => navigate(id ? `/students/${id}` : "/students")}
    >
      {(!id || student) && (
        <StudentForm
          student={student}
          onCancel={() => navigate(id ? `/students/${id}` : "/students")}
          onSaved={(saved, created) => {
            notify.success(created ? t("form.created", { matricula: saved.matricula }) : t("form.saved"));
            navigate(`/students/${saved.id}`);
          }}
        />
      )}
    </ITPage>
  );
}
