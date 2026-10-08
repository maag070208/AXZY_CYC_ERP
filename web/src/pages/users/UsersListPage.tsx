import {
  ITButton,
  ITFlex,
  ITPage,
  ITText,
  ITToast,
} from "@axzydev/axzy_ui_system";
import { FaPlus, FaSync, FaUsers } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { useCan } from "@entities/user";
import { useUsersTable, UsersTable } from "@features/user/users-list";

export default function UsersListPage() {
  const { t: tt } = useTranslation(["users", "common"]);
  const canCreateUsers = useCan("users.create");
  const fx = useUsersTable();

  return (
    <ITPage
      title={tt("list.title")}
      description={tt("list.description", { count: fx.total })}
      noPadding
      icon={<FaUsers size={20} />}
      actions={
        <ITFlex gap={2}>
          <ITButton variant="outlined" color="secondary" onClick={fx.reload}>
            <ITFlex align="center" gap={1}>
              <FaSync size={11} />
              <ITText className="font-bold text-[11px]">{tt("common:actions.reload")}</ITText>
            </ITFlex>
          </ITButton>
          {canCreateUsers && (
            <ITButton variant="filled" color="primary" disabled>
              <ITFlex align="center" gap={1}>
                <FaPlus size={11} />
                <ITText className="font-bold text-[11px]">{tt("list.new")}</ITText>
              </ITFlex>
            </ITButton>
          )}
        </ITFlex>
      }
    >
      <UsersTable fx={fx} />

      {fx.toast && (
        <ITToast
          message={fx.toast.message}
          type={fx.toast.type}
          position="bottom-center"
          duration={2500}
          onClose={() => fx.setToast(null)}
        />
      )}
    </ITPage>
  );
}
