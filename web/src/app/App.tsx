import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "@pages/auth/LoginPage";
import ForgotPasswordPage from "@pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@pages/auth/ResetPasswordPage";
import HomePage from "@pages/home/HomePage";
import UsersListPage from "@pages/users/UsersListPage";
import RolesPage from "@pages/roles/RolesPage";
import AuditPage from "@pages/audit/AuditPage";
import CatalogsPage from "@pages/catalogs/CatalogsPage";
import SettingsPage from "@pages/settings/SettingsPage";
import ChangePasswordPage from "@pages/account/ChangePasswordPage";
import StudentsListPage from "@pages/students/StudentsListPage";
import StudentFormPage from "@pages/students/StudentFormPage";
import StudentDetailPage from "@pages/students/StudentDetailPage";
import TeachersPage from "@pages/teachers/TeachersPage";
import CoursesPage from "@pages/courses/CoursesPage";
import GroupsPage from "@pages/groups/GroupsPage";
import GroupDetailPage from "@pages/groups/GroupDetailPage";
import FinancePage from "@pages/finance/FinancePage";
import ExpensesPage from "@pages/expenses/ExpensesPage";
import ReportsPage from "@pages/reports/ReportsPage";
import QuestionsPage from "@pages/questions/QuestionsPage";
import ExamsPage from "@pages/exams/ExamsPage";
import ExamDetailPage from "@pages/exams/ExamDetailPage";
import MyExamsPage from "@pages/my-exams/MyExamsPage";
import ExamRunnerPage from "@pages/my-exams/ExamRunnerPage";
import AttendancePage from "@pages/attendance/AttendancePage";
import NotificationsPage from "@pages/notifications/NotificationsPage";
import MigrationPage from "@pages/migration/MigrationPage";
import ProgramsPage from "@pages/programs/ProgramsPage";
import ProgramDetailPage from "@pages/programs/ProgramDetailPage";
import PrivateRoutes from "./guards/PrivateRoutes";
import RequireAuth from "./guards/RequireAuth";
import RequiresPermission from "./guards/RequirePermission";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Pantalla dedicada (a pantalla completa, sin ITLayout). */}
      <Route element={<RequireAuth />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
      </Route>

      <Route element={<PrivateRoutes />}>
        <Route path="/" element={<HomePage />} />

        <Route
          path="/students"
          element={
            <RequiresPermission permission="students.view">
              <StudentsListPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/students/new"
          element={
            <RequiresPermission permission="students.create">
              <StudentFormPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/students/:id"
          element={
            <RequiresPermission permission="students.view">
              <StudentDetailPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/students/:id/edit"
          element={
            <RequiresPermission permission="students.edit">
              <StudentFormPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/teachers"
          element={
            <RequiresPermission permission="teachers.view">
              <TeachersPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/courses"
          element={
            <RequiresPermission permission="courses.view">
              <CoursesPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/groups"
          element={
            <RequiresPermission permission="groups.view">
              <GroupsPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/groups/:id"
          element={
            <RequiresPermission permission="groups.view">
              <GroupDetailPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/programs"
          element={
            <RequiresPermission permission="programs.view">
              <ProgramsPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/programs/:id"
          element={
            <RequiresPermission permission="programs.view">
              <ProgramDetailPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/finance"
          element={
            <RequiresPermission permission={["charges.create", "payments.register", "fee_concepts.manage"]}>
              <FinancePage />
            </RequiresPermission>
          }
        />
        <Route
          path="/expenses"
          element={
            <RequiresPermission permission="expenses.view">
              <ExpensesPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/questions"
          element={
            <RequiresPermission permission="questions.view">
              <QuestionsPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/exams"
          element={
            <RequiresPermission permission={["exams.manage", "attempts.review"]}>
              <ExamsPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/exams/:id"
          element={
            <RequiresPermission permission={["exams.manage", "attempts.review"]}>
              <ExamDetailPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/my-exams"
          element={
            <RequiresPermission permission="attempts.take">
              <MyExamsPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/exam/:attemptId"
          element={
            <RequiresPermission permission="attempts.take">
              <ExamRunnerPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/reports"
          element={
            <RequiresPermission permission="reports.view">
              <ReportsPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/attendance"
          element={
            <RequiresPermission permission={["attendance.view", "attendance.justify"]}>
              <AttendancePage />
            </RequiresPermission>
          }
        />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route
          path="/migration"
          element={
            <RequiresPermission permission="migration.execute">
              <MigrationPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/users"
          element={
            <RequiresPermission permission="users.view">
              <UsersListPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/roles"
          element={
            <RequiresPermission permission="roles.manage">
              <RolesPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/audit"
          element={
            <RequiresPermission permission="audit.view">
              <AuditPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/catalogs"
          element={
            <RequiresPermission permission={["levels.view", "config.view"]}>
              <CatalogsPage />
            </RequiresPermission>
          }
        />
        <Route
          path="/settings"
          element={
            <RequiresPermission permission="config.view">
              <SettingsPage />
            </RequiresPermission>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
