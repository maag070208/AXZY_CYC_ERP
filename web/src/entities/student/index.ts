// API pública del slice "student" (M03 alumnos + M05 movimientos).
export { studentApi } from "./api/studentApi";
export { default as StudentSearch } from "./ui/StudentSearch";
export type {
  Gender,
  Guardian,
  MovementInput,
  MovementResult,
  MovementType,
  Student,
  StudentInput,
  StudentMovement,
  StudentStatus,
  StudentSummary,
} from "./model/types";
