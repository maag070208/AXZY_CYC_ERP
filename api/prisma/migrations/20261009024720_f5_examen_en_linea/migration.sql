-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('OPCION_MULTIPLE', 'VERDADERO_FALSO', 'MULTIPLE_RESPUESTA', 'ABIERTA');

-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('FACIL', 'MEDIA', 'DIFICIL');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('ACTIVA', 'INACTIVA');

-- CreateEnum
CREATE TYPE "OnlineExamStatus" AS ENUM ('BORRADOR', 'PUBLICADO', 'CERRADO');

-- CreateEnum
CREATE TYPE "AttemptCriterion" AS ENUM ('MEJOR', 'ULTIMO');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('EN_CURSO', 'ENVIADO', 'EXPIRADO');

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "tema" TEXT,
    "tipo" "QuestionType" NOT NULL,
    "enunciado" TEXT NOT NULL,
    "puntos" DECIMAL(6,2) NOT NULL,
    "dificultad" "QuestionDifficulty",
    "status" "QuestionStatus" NOT NULL DEFAULT 'ACTIVA',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "es_correcta" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_exams" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "instrucciones" TEXT,
    "duracion_min" INTEGER NOT NULL,
    "intentos_max" INTEGER NOT NULL DEFAULT 1,
    "fecha_apertura" TIMESTAMPTZ NOT NULL,
    "fecha_cierre" TIMESTAMPTZ NOT NULL,
    "aleatorizar_preguntas" BOOLEAN NOT NULL DEFAULT false,
    "aleatorizar_opciones" BOOLEAN NOT NULL DEFAULT false,
    "mostrar_resultado" BOOLEAN NOT NULL DEFAULT true,
    "puntaje_aprobatorio" DECIMAL(6,2) NOT NULL,
    "criterio_intentos" "AttemptCriterion" NOT NULL DEFAULT 'MEJOR',
    "assessment_id" TEXT,
    "status" "OnlineExamStatus" NOT NULL DEFAULT 'BORRADOR',
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_exam_questions" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "puntos" DECIMAL(6,2) NOT NULL,
    "orden" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "status" "AttemptStatus" NOT NULL DEFAULT 'EN_CURSO',
    "layout" JSONB NOT NULL,
    "score" DECIMAL(6,2),
    "pending_count" INTEGER NOT NULL DEFAULT 0,
    "graded_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "focus_losses" INTEGER NOT NULL DEFAULT 0,
    "events" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "respuesta" JSONB,
    "es_correcta" BOOLEAN,
    "puntos_obtenidos" DECIMAL(6,2),
    "comentario" TEXT,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questions_course_id_idx" ON "questions"("course_id");

-- CreateIndex
CREATE INDEX "questions_tipo_idx" ON "questions"("tipo");

-- CreateIndex
CREATE INDEX "questions_dificultad_idx" ON "questions"("dificultad");

-- CreateIndex
CREATE INDEX "questions_status_idx" ON "questions"("status");

-- CreateIndex
CREATE INDEX "question_options_question_id_idx" ON "question_options"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "online_exams_assessment_id_key" ON "online_exams"("assessment_id");

-- CreateIndex
CREATE INDEX "online_exams_group_id_idx" ON "online_exams"("group_id");

-- CreateIndex
CREATE INDEX "online_exams_status_idx" ON "online_exams"("status");

-- CreateIndex
CREATE INDEX "online_exam_questions_question_id_idx" ON "online_exam_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "online_exam_questions_exam_id_question_id_key" ON "online_exam_questions"("exam_id", "question_id");

-- CreateIndex
CREATE INDEX "exam_attempts_exam_id_student_id_idx" ON "exam_attempts"("exam_id", "student_id");

-- CreateIndex
CREATE INDEX "exam_attempts_student_id_status_idx" ON "exam_attempts"("student_id", "status");

-- CreateIndex
CREATE INDEX "exam_attempts_status_ends_at_idx" ON "exam_attempts"("status", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_exam_id_student_id_numero_key" ON "exam_attempts"("exam_id", "student_id", "numero");

-- CreateIndex
CREATE INDEX "attempt_answers_attempt_id_idx" ON "attempt_answers"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_answers_attempt_id_question_id_key" ON "attempt_answers"("attempt_id", "question_id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_exams" ADD CONSTRAINT "online_exams_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_exams" ADD CONSTRAINT "online_exams_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_exam_questions" ADD CONSTRAINT "online_exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "online_exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_exam_questions" ADD CONSTRAINT "online_exam_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "online_exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que Prisma no modela (M14/M15/M16).
ALTER TABLE "questions" ADD CONSTRAINT "questions_puntos_positive" CHECK ("puntos" > 0);
ALTER TABLE "online_exams" ADD CONSTRAINT "online_exams_duracion_positive" CHECK ("duracion_min" > 0);
ALTER TABLE "online_exams" ADD CONSTRAINT "online_exams_intentos_positive" CHECK ("intentos_max" >= 1);
ALTER TABLE "online_exams" ADD CONSTRAINT "online_exams_window" CHECK ("fecha_apertura" < "fecha_cierre");
ALTER TABLE "online_exam_questions" ADD CONSTRAINT "online_exam_questions_puntos_positive" CHECK ("puntos" > 0);
-- Un solo intento EN_CURSO por alumno y examen (dos clics a la vez no abren dos).
CREATE UNIQUE INDEX "exam_attempts_single_open" ON "exam_attempts"("exam_id", "student_id") WHERE "status" = 'EN_CURSO';
