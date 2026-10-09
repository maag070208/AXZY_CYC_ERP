import { ITAlert, ITBadget, ITButton, ITFlex, ITLoader, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { FaSave, FaUndo } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import type { Scope } from "@entities/user";
import type { PermissionCatalog, RoleAdmin } from "@entities/permission";
import { dyn } from "@shared/i18n";
import { useNotify } from "@app/toast/useNotify";
import { PanelCard } from "@shared/ui/panel-card";
import { useMatrixEditor } from "../model/useMatrixEditor";

interface Props {
  roles: RoleAdmin[];
}

/** Editor de la matriz: filas = permisos (por módulo), columnas = roles. */
export default function MatrixEditor({ roles }: Props) {
  const { t } = useTranslation(["roles", "common"]);
  const tc = dyn(t);
  const notify = useNotify();
  const fx = useMatrixEditor((count) => notify.success(t("matrix.saved", { count })));

  if (fx.loading && !fx.data) return <ITLoader />;
  const catalog = fx.data?.catalog ?? [];
  const columns = (fx.data?.roles ?? [])
    .map((key) => roles.find((role) => role.key === key) ?? null)
    .filter((role): role is RoleAdmin => !!role && role.active);

  const byModule = new Map<string, PermissionCatalog[]>();
  for (const permission of catalog) {
    byModule.set(permission.module, [...(byModule.get(permission.module) ?? []), permission]);
  }

  return (
    <PanelCard
      description={fx.pending > 0 ? t("matrix.pending", { count: fx.pending }) : undefined}
      actions={
        <>
          <ITButton variant="outlined" color="secondary" disabled={fx.pending === 0} onClick={fx.discard}>
            <ITFlex align="center" gap={1}>
              <FaUndo size={11} />
              <ITText className="font-bold text-[11px]">{t("matrix.discard")}</ITText>
            </ITFlex>
          </ITButton>
          <ITButton
            variant="filled"
            color="primary"
            disabled={fx.pending === 0 || fx.saving}
            onClick={() => void fx.save()}
          >
            <ITFlex align="center" gap={1}>
              <FaSave size={11} />
              <ITText className="font-bold text-[11px]">{t("matrix.save")}</ITText>
            </ITFlex>
          </ITButton>
        </>
      }
    >
      {fx.error && (
        <div className="mb-3">
          <ITAlert variant="error">{fx.error}</ITAlert>
        </div>
      )}
      {catalog.length === 0 ? (
        <ITText className="text-[12px] text-slate-500">{t("matrix.empty")}</ITText>
      ) : (
        <div className="overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-[12px]" aria-label={t("tabs.matrix")}>
            <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("matrix.permission")}</th>
                {columns.map((role) => (
                  <th key={role.key} className="px-3 py-2 text-center">
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...byModule.entries()].map(([module, permissions]) => (
                <ModuleBlock key={module} module={module} span={columns.length + 1}>
                  {permissions.map((permission) => (
                    <tr key={permission.key} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <ITText className="block font-bold text-slate-700">{permission.name}</ITText>
                        <ITFlex gap={1} align="center">
                          <ITText className="text-[10px] text-slate-400">{permission.key}</ITText>
                          {permission.sensitive && (
                            <ITBadget color="danger" size="sm">
                              {t("matrix.sensitive")}
                            </ITBadget>
                          )}
                          {!permission.active && (
                            <ITBadget color="gray" size="sm">
                              {t("matrix.inactive")}
                            </ITBadget>
                          )}
                        </ITFlex>
                      </td>
                      {columns.map((role) => (
                        <td key={role.key} className="px-2 py-2 text-center">
                          <ITSelect
                            name={`matrix:${role.key}:${permission.key}`}
                            size="sm"
                            className={fx.isDirty(role.key, permission.key) ? "!border-amber-400 !bg-amber-50" : ""}
                            value={fx.scopeOf(role.key, permission.key)}
                            disabled={!permission.active}
                            options={[...new Set<Scope>(["NONE", ...permission.scopes])].map((scope) => ({
                              value: scope,
                              label: tc(`common:scopes.${scope}`),
                            }))}
                            onChange={(e) => fx.setScope(role.key, permission.key, e.target.value as Scope)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </ModuleBlock>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}

function ModuleBlock({ module, span, children }: { module: string; span: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-slate-100/60">
        <td colSpan={span} className="px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
          {module}
        </td>
      </tr>
      {children}
    </>
  );
}
