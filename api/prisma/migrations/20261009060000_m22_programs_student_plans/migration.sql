-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('BIMONTHLY', 'TRIMESTER', 'QUADRIMESTER', 'SEMESTER');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "charges" ADD COLUMN     "plan_charge_index" INTEGER,
ADD COLUMN     "plan_id" TEXT;

-- AlterTable
ALTER TABLE "terms" ADD COLUMN     "calendar" JSONB;

-- CreateTable
CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "period_type" "PeriodType" NOT NULL,
    "period_count" INTEGER NOT NULL,
    "months_per_period" INTEGER,
    "monthly_fee" DECIMAL(12,2) NOT NULL,
    "enrollment_fee" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_subjects" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "period_index" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_plans" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "term_id" TEXT,
    "start_date" DATE NOT NULL,
    "period_type" "PeriodType" NOT NULL,
    "period_count" INTEGER NOT NULL,
    "monthly_fee" DECIMAL(12,2) NOT NULL,
    "enrollment_fee" DECIMAL(12,2) NOT NULL,
    "discount_percent" DECIMAL(5,2),
    "discount_amount" DECIMAL(12,2),
    "discount_reason" VARCHAR(200),
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "programs_code_key" ON "programs"("code");

-- CreateIndex
CREATE INDEX "programs_active_idx" ON "programs"("active");

-- CreateIndex
CREATE INDEX "program_subjects_program_id_period_index_idx" ON "program_subjects"("program_id", "period_index");

-- CreateIndex
CREATE UNIQUE INDEX "program_subjects_program_id_course_id_key" ON "program_subjects"("program_id", "course_id");

-- CreateIndex
CREATE INDEX "student_plans_student_id_status_idx" ON "student_plans"("student_id", "status");

-- CreateIndex
CREATE INDEX "student_plans_program_id_idx" ON "student_plans"("program_id");

-- CreateIndex
CREATE UNIQUE INDEX "charges_plan_id_plan_charge_index_key" ON "charges"("plan_id", "plan_charge_index");

-- AddForeignKey
ALTER TABLE "charges" ADD CONSTRAINT "charges_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "student_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_subjects" ADD CONSTRAINT "program_subjects_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_subjects" ADD CONSTRAINT "program_subjects_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_plans" ADD CONSTRAINT "student_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_plans" ADD CONSTRAINT "student_plans_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_plans" ADD CONSTRAINT "student_plans_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

