// API pública del slice "online-exam" (M15–M17: exámenes, intentos y calificación).
export { attemptApi, onlineExamApi } from "./api/onlineExamApi";
export type {
  AnswerValue,
  Attempt,
  AttemptQuestion,
  AttemptStatus,
  AvailableExam,
  Criterion,
  ExamResults,
  ExamStatus,
  OnlineExam,
  OnlineExamDetail,
  OnlineExamInput,
} from "./model/types";
