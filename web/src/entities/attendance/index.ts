// API pública del slice "attendance" (M18: asistencia y justificantes).
export { attendanceApi, justificationApi } from "./api/attendanceApi";
export { ATTENDANCE_STATUSES } from "./model/types";
export type {
  AttendanceMark,
  AttendanceRoll,
  AttendanceRollRow,
  AttendanceSession,
  AttendanceStatus,
  AttendanceSummaryRow,
  GroupAttendanceSummary,
  Justification,
  JustificationStatus,
  RollCallItem,
  SessionInput,
  StudentAttendance,
  StudentAttendanceGroup,
  StudentAttendanceRecord,
} from "./model/types";
