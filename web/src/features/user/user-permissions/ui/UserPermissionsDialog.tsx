import { ITAlert, ITBadget, ITButton, ITDialog, ITFlex, ITLoader, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import type { Scope, User, UserPermissionRow } from "@entities/user";
import { dyn } from "@shared/i18n";
import { useNotify } from "@app/toast/useNotify";
import { useUserPermissions } from "../model/useUserPermissions";

interface Props {
  user: User | null;
  onClose: () => void;
}

const SCOPE_COLOR: Record<Scope, "gray" | "info" | "warning" | "success"> = {
  NONE: "gray",
  OWN: "info",
  AREA: "warning",
  ALL: "success",
};

/** Permisos por persona: lo del rol, la excepción y el efectivo, por permiso. */
export default function UserPermissionsDialog({ user, onClose }: Props) {
  const { t, i18n } = useTranslation(["users", "common"]);
  const tc = dyn(t);
  const notify = useNotify();
  const fx = useUserPermissions(user);

  const scopeLabel = (scope: Scope) => tc(`common:scopes.${scope}`);

  const byModule = new Map<string, UserPermissionRow[]>();
  for (const row of fx.view?.permissions ?? []) {
    byModule.set(row.module, [...(byModule.get(row.module) ?? []), row]);
  }

  const onScope = async (row: UserPermissionRow, value: string) => {
    if (!value) return;
    if (await fx.setException(row.permission, value as Scope)) notify.success(t("permissions.saved"));
  };

  const onRemove = async (row: UserPermissionRow) => {
    if (await fx.removeException(row.permission)) notify.success(t("permissions.removed"));
  };

  return (
    <ITDialog
      isOpen={!!user}
      onClose={onClose}
      title={t("permissions.title", { name: user?.name ?? "" })}
      className="w-full max-w-4xl"
    >
      <div role="dialog" aria-label={t("permissions.title", { name: user?.name ?? "" })}>
        <ITFlex direction="column" gap={3}>
          <ITText className="text-[12px] text-slate-500">{t("permissions.description")}</ITText>
          {fx.error && <ITAlert variant="error">{fx.error}</ITAlert>}
          {fx.loading && !fx.view ? (
            <ITLoader />
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-[12px]">
                <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t("permissions.permission")}</th>
                    <th className="px-3 py-2">{t("permissions.fromRole")}</th>
                    <th className="px-3 py-2">{t("permissions.exception")}</th>
                    <th className="px-3 py-2">{t("permissions.effective")}</th>
                    <th className="px-3 py-2">{t("permissions.expires")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byModule.entries()].map(([module, rows]) => (
                    <ModuleRows
                      key={module}
                      module={module}
                      rows={rows}
                      busy={fx.busy}
                      scopeLabel={scopeLabel}
                      locale={i18n.language}
                      onScope={onScope}
                      onRemove={onRemove}
                      t={t}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ITFlex justify="end">
            <ITButton variant="outlined" color="secondary" onClick={onClose}>
              {t("common:actions.close")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </div>
    </ITDialog>
  );
}

interface ModuleRowsProps {
  module: string;
  rows: UserPermissionRow[];
  busy: string | null;
  locale: string;
  scopeLabel: (scope: Scope) => string;
  onScope: (row: UserPermissionRow, value: string) => void;
  onRemove: (row: UserPermissionRow) => void;
  t: ReturnType<typeof useTranslation<["users", "common"]>>["t"];
}

function ModuleRows({ module, rows, busy, locale, scopeLabel, onScope, onRemove, t }: ModuleRowsProps) {
  return (
    <>
      <tr className="bg-slate-100/60">
        <td colSpan={5} className="px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
          {module}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.permission} className="border-t border-slate-100" data-permission={row.permission}>
          <td className="px-3 py-2">
            <ITText className="block font-bold text-slate-700">{row.name}</ITText>
            <ITText className="text-[10px] text-slate-400">{row.permission}</ITText>
            {row.sensitive && (
              <ITBadget color="danger" size="sm" className="ml-2">
                {t("permissions.sensitive")}
              </ITBadget>
            )}
          </td>
          <td className="px-3 py-2">
            <ITBadget color={SCOPE_COLOR[row.roleScope]} size="sm">
              {scopeLabel(row.roleScope)}
            </ITBadget>
          </td>
          <td className="px-3 py-2">
            <ITFlex align="center" gap={2}>
              <ITSelect
                name={`exception-${row.permission}`}
                size="sm"
                value={row.exception?.scope ?? ""}
                placeholder={t("permissions.noException")}
                disabled={busy === row.permission}
                options={[...new Set<Scope>(["NONE", ...row.scopes])].map((scope) => ({
                  value: scope,
                  label: scopeLabel(scope),
                }))}
                onChange={(e) => onScope(row, e.target.value)}
              />
              {row.exception && (
                <ITButton
                  variant="text"
                  color="danger"
                  size="sm"
                  disabled={busy === row.permission}
                  onClick={() => onRemove(row)}
                >
                  {t("permissions.removeException")}
                </ITButton>
              )}
            </ITFlex>
          </td>
          <td className="px-3 py-2">
            <ITBadget color={SCOPE_COLOR[row.effective]} size="sm">
              {scopeLabel(row.effective)}
            </ITBadget>
          </td>
          <td className="px-3 py-2 text-[11px] text-slate-500">
            {row.exception?.expiresAt
              ? new Date(row.exception.expiresAt).toLocaleDateString(locale)
              : row.exception
                ? "∞"
                : "—"}
          </td>
        </tr>
      ))}
    </>
  );
}
