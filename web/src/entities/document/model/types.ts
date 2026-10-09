export type DocumentStatus = "PENDING" | "VALIDATED" | "REJECTED";

export interface StudentDocument {
  id: string;
  studentId: string;
  documentTypeId: string;
  documentType: string;
  required: boolean;
  originalName: string;
  mimeType: string;
  size: number;
  status: DocumentStatus;
  notes: string | null;
  uploadedByName: string | null;
  validatedByName: string | null;
  validatedAt: string | null;
  createdAt: string;
}

export interface StudentDocuments {
  documents: StudentDocument[];
  /** Tipos obligatorios sin un documento VALIDADO. */
  missing: Array<{ id: string; name: string }>;
  requiredCount: number;
}

export interface KardexEntry {
  termId: string;
  termName: string;
  courseId: string;
  courseName: string;
  groupName: string;
  grades: number[];
  weights: number[];
  finalGrade: number | null;
  status: "PASSED" | "FAILED" | "IN_PROGRESS" | "WITHDRAWN";
}

export interface Kardex {
  studentId: string;
  studentNumber: string;
  name: string;
  status: "ACTIVE" | "WITHDRAWN";
  enrollmentDate: string;
  entries: KardexEntry[];
  overallAverage: number | null;
  passedCredits: number;
  missingDocuments: string[];
  minPassingGrade: number;
  school: string;
  generatedAt: string;
}

/** Límite de la API (también se valida en el cliente para avisar antes). */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
