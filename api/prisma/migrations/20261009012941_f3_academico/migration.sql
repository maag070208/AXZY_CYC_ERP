-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('INSCRITO', 'BAJA', 'ACREDITADO', 'REPROBADO');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('PARCIAL', 'FINAL', 'TAREA', 'OTRO');

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "level_id" TEXT,
    "descripcion" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "term_id" TEXT NOT NULL,
    "teacher_id" TEXT,
    "nombre" TEXT NOT NULL,
    "cupo" INTEGER NOT NULL,
    "horario" JSONB NOT NULL,
    "aula" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "closed_at" TIMESTAMP(3),
    "closed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'INSCRITO',
    "final_grade" DECIMAL(5,2),
    "baja_at" TIMESTAMP(3),
    "baja_motivo" TEXT,
    "transferred_to_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "AssessmentType" NOT NULL,
    "ponderacion" DECIMAL(5,2) NOT NULL,
    "fecha" DATE,
    "max_score" DECIMAL(6,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "score" DECIMAL(6,2),
    "observaciones" TEXT,
    "captured_by" TEXT,
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courses_clave_key" ON "courses"("clave");

-- CreateIndex
CREATE INDEX "courses_active_idx" ON "courses"("active");

-- CreateIndex
CREATE INDEX "courses_nombre_idx" ON "courses"("nombre");

-- CreateIndex
CREATE INDEX "groups_term_id_idx" ON "groups"("term_id");

-- CreateIndex
CREATE INDEX "groups_teacher_id_idx" ON "groups"("teacher_id");

-- CreateIndex
CREATE INDEX "groups_active_idx" ON "groups"("active");

-- CreateIndex
CREATE UNIQUE INDEX "groups_course_id_term_id_nombre_key" ON "groups"("course_id", "term_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_transferred_to_id_key" ON "enrollments"("transferred_to_id");

-- CreateIndex
CREATE INDEX "enrollments_student_id_status_idx" ON "enrollments"("student_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_group_id_status_idx" ON "enrollments"("group_id", "status");

-- CreateIndex
CREATE INDEX "assessments_group_id_idx" ON "assessments"("group_id");

-- CreateIndex
CREATE INDEX "grades_enrollment_id_idx" ON "grades"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "grades_assessment_id_enrollment_id_key" ON "grades"("assessment_id", "enrollment_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_transferred_to_id_fkey" FOREIGN KEY ("transferred_to_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que Prisma no modela (M07/M08).
-- Una sola inscripción vigente (no BAJA) por alumno y grupo.
CREATE UNIQUE INDEX "enrollments_active_unique" ON "enrollments"("student_id", "group_id") WHERE "status" <> 'BAJA';
ALTER TABLE "groups" ADD CONSTRAINT "groups_cupo_positive" CHECK ("cupo" >= 1);
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_ponderacion_range" CHECK ("ponderacion" > 0 AND "ponderacion" <= 100);
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_max_score_positive" CHECK ("max_score" > 0);
ALTER TABLE "grades" ADD CONSTRAINT "grades_score_non_negative" CHECK ("score" IS NULL OR "score" >= 0);
