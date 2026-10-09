-- DropForeignKey
ALTER TABLE "program_subjects" DROP CONSTRAINT "program_subjects_course_id_fkey";

-- AddForeignKey
ALTER TABLE "program_subjects" ADD CONSTRAINT "program_subjects_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

