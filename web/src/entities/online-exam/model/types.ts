export type ExamStatus = "DRAFT" | "PUBLISHED" | "CLOSED";
export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "EXPIRED";
export type Criterion = "BEST" | "LAST";

/** Examen en línea (`/online-exams`, M15). Fechas en ISO (UTC). */
export interface OnlineExam {
  id: string;
  groupId: string;
  groupName: string;
  courseId: string;
  courseName: string;
  termName: string;
  title: string;
  instructions: string | null;
  durationMin: number;
  maxAttempts: number;
  opensAt: string;
  closesAt: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResult: boolean;
  passingScore: number;
  attemptCriterion: Criterion;
  assessmentId: string | null;
  assessmentName: string | null;
  status: ExamStatus;
  totalPoints: number;
  questionCount: number;
  attemptCount: number;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface OnlineExamDetail extends OnlineExam {
  questions: Array<{ questionId: string; sortOrder: number; points: number; type: string; topic: string | null; text: string; status: "ACTIVE" | "INACTIVE" }>;
}

export interface OnlineExamInput {
  groupId?: string;
  title?: string;
  instructions?: string | null;
  durationMin?: number;
  maxAttempts?: number;
  opensAt?: string;
  closesAt?: string;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResult?: boolean;
  passingScore?: number;
  attemptCriterion?: Criterion;
  assessmentId?: string | null;
}

/** Examen visto por el alumno (`/online-exams/available`). */
export interface AvailableExam {
  examId: string;
  title: string;
  courseName: string;
  groupName: string;
  opensAt: string;
  closesAt: string;
  durationMin: number;
  maxAttempts: number;
  attemptsUsed: number;
  totalPoints: number;
  state: "NOT_PUBLISHED" | "NOT_OPEN" | "CLOSED" | "OPEN";
  inProgressAttemptId: string | null;
  canStart: boolean;
  lastAttempt: { attemptId: string; status: AttemptStatus; finishedAt: string | null; score: number | null; pendingCount: number | null } | null;
}

export type AnswerValue = string | string[] | null;

export interface AttemptQuestion {
  questionId: string;
  sortOrder: number;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "MULTIPLE_ANSWER" | "OPEN";
  text: string;
  points: number;
  options: Array<{ id: string; text: string; isCorrect?: boolean }>;
  answer: AnswerValue;
  isCorrect?: boolean | null;
  pointsEarned?: number | null;
  comment?: string | null;
}

export interface Attempt {
  attemptId: string;
  examId: string;
  title: string;
  instructions: string | null;
  number: number;
  status: AttemptStatus;
  student: { id: string; studentNumber: string; name: string };
  startedAt: string;
  endsAt: string;
  finishedAt: string | null;
  remainingSeconds: number;
  serverTime: string;
  focusLosses: number;
  questions: AttemptQuestion[];
  result: { score: number; totalPoints: number; pendingCount: number; passed: boolean | null } | null;
}

export interface ExamResults {
  exam: OnlineExamDetail;
  kpis: { enrolledCount: number; submittedCount: number; average: number | null; passedCount: number; pendingReview: number; totalPoints: number };
  rows: Array<{
    enrollmentId: string;
    studentId: string;
    studentNumber: string;
    name: string;
    attemptCount: number;
    inProgress: boolean;
    pending: number;
    grade: number | null;
    passed: boolean | null;
    attempts: Array<{ attemptId: string; number: number; status: AttemptStatus; score: number | null; pendingCount: number; focusLosses: number; startedAt: string; finishedAt: string | null }>;
  }>;
}
