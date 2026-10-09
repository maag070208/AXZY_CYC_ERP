-- D-046: claves de rol base en inglés (las FK tienen ON UPDATE CASCADE).
UPDATE "roles" SET "key" = 'SCHOOL_CONTROL' WHERE "key" = 'CONTROL_ESCOLAR';
UPDATE "roles" SET "key" = 'TEACHER' WHERE "key" = 'PROFESOR';
UPDATE "roles" SET "key" = 'STUDENT' WHERE "key" = 'ALUMNO';
