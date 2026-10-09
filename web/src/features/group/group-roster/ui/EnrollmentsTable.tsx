import { useCallback } from "react";
import { ITBadget, ITButton, ITDataTable, ITFlex, ITText } from "@axzydev/axzy_ui_system";
import type { Column, ITDataTableFetchParams, ITDataTableResponse } from "@axzydev/axzy_ui_system";
import { FaExchangeAlt, FaUserMinus } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { enrollmentApi, type Enrollment, type EnrollmentStatus } from "@entities/group";
import { formatDay } from "@shared/lib/day";

export type EnrollmentAction = "change" | "drop";

const STATUS_COLOR: Record<EnrollmentStatus, "success" | "danger" | "primary" | "secondary"> = {
  ENROLLED: "primary",
  PASSED: "success",
  FAILED: "danger",
  WITHDRAWN: "secondary",
};

interface Props {
  /** Roster de un grupo o historial de un alumno. */
  filter: { groupId: string } | { studentId: string };
  reloadKey: number;
  /** Acciones de gestión (solo en el roster de un grupo abierto). */
  onAction?: (action: EnrollmentAction, enrollment: Enrollment) => void;
  canChange?: boolean;
  canDrop?: boolean;
}

/** Inscripciones server-side (`POST /enrollments/query`). */
export default function EnrollmentsTable({ filter, reloadKey, onAction, canChange, canDrop }: Props) {
  const { t, i18n } = useTranslation(["courses", "common"]);
  const byGroup = "groupId" in filter;
  const key = byGroup ? filter.groupId : filter.studentId;

  const fetchData = useCallback(
    async (params: ITDataTableFetchParams) => {
      const res = await enrollmentApi.table({
        page: params.page,
        limit: params.limit,
        filters: { ...params.filters, ...(byGroup ? { groupId: key } : { studentId: key }) },
        sort: params.sort,
      });
      return { data: res.data as unknown as Record<string, unknown>[], total: res.total };
    },
    [byGroup, key]
  );

  const columns: Column<Enrollment>[] = [
    ...(byGroup
      ? [
          { key: "studentNumber", label: t("enrollments.studentNumber"), type: "string" as const, width: 130, filter: true, sortable: false },
          {
            key: "name", label: t("enrollments.student"), type: "string" as const, filter: true, sortable: false,
            render: (row: Enrollment) => (
              <ITFlex align="center" gap={2}>
                <ITText className="text-[12px] font-bold text-slate-700">{row.studentName}</ITText>
                {row.studentStatus === "WITHDRAWN" && <ITBadget color="danger" size="sm">{t("enrollments.inactiveStudent")}</ITBadget>}
              </ITFlex>
            ),
          },
        ]
      : [
          {
            key: "courseName", label: t("enrollments.courseName"), type: "string" as const,
            render: (row: Enrollment) => <ITText className="text-[12px] font-bold text-slate-700">{row.courseName}</ITText>,
          },
          { key: "groupName", label: t("enrollments.groupName"), type: "string" as const, width: 100 },
          { key: "termName", label: t("enrollments.termName"), type: "string" as const, width: 140 },
        ]),
    {
      key: "date", label: t("enrollments.date"), type: "string", width: 130, sortable: false,
      render: (row) => <ITText className="text-[12px] text-slate-600">{formatDay(row.date, i18n.language)}</ITText>,
    },
    {
      key: "status", label: t("enrollments.status"), type: "catalog", width: 130, filter: "catalog", sortable: false,
      catalogOptions: {
        data: (["ENROLLED", "WITHDRAWN", "PASSED", "FAILED"] as const).map((s) => ({ id: s, name: t(`enrollments.statuses.${s}`) })),
      },
      render: (row) => (
        <span title={row.withdrawalReason ?? undefined}>
          <ITBadget color={STATUS_COLOR[row.status]} size="sm">{t(`enrollments.statuses.${row.status}`)}</ITBadget>
        </span>
      ),
    },
    {
      key: "finalGrade", label: t("enrollments.final"), type: "number", width: 90,
      render: (row) => <ITText className="text-[12px] font-bold text-slate-700">{row.finalGrade ?? "—"}</ITText>,
    },
    ...(onAction && (canChange || canDrop)
      ? [{
          key: "actions", label: t("common:labels.actions"), type: "actions" as const, width: 110,
          actions: (row: Enrollment) =>
            row.status === "ENROLLED" ? (
              <ITFlex gap={1}>
                {canChange && (
                  <ITButton variant="text" color="primary" size="sm" title={t("enrollments.changeGroup")}
                    ariaLabel={`${t("enrollments.changeGroup")} ${row.studentName}`} onClick={() => onAction("change", row)}>
                    <FaExchangeAlt size={12} />
                  </ITButton>
                )}
                {canDrop && (
                  <ITButton variant="text" color="danger" size="sm" title={t("enrollments.drop")}
                    ariaLabel={`${t("enrollments.drop")} ${row.studentName}`} onClick={() => onAction("drop", row)}>
                    <FaUserMinus size={12} />
                  </ITButton>
                )}
              </ITFlex>
            ) : null,
        }]
      : []),
  ];

  return (
    <ITDataTable
      columns={columns as unknown as Column<Record<string, unknown>>[]}
      fetchData={fetchData as unknown as (p: ITDataTableFetchParams) => Promise<ITDataTableResponse<Record<string, unknown>>>}
      reloadTrigger={reloadKey}
      defaultItemsPerPage={50}
      itemsPerPageOptions={[25, 50, 100]}
      layout="fixed"
      density="compact"
      virtualized
      virtualizedMaxHeight={400}
      rowHeight={50}
    />
  );
}
