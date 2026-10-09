import type { Guardian, Student, StudentMovement, User } from "@prisma/client";

export type StudentRow = Student & { guardians: Guardian[] };

export type MovementRow = StudentMovement & { author: Pick<User, "name"> | null };

/**
 * Puerto para cancelar inscripciones activas al dar de baja (M05 regla 2).
 * M07 lo implementa; mientras no existan inscripciones devuelve 0.
 */
export type EnrollmentCanceller = (studentId: string, tx: unknown) => Promise<number>;
