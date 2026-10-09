import { ITAlert, ITButton, ITCheckbox, ITFlex, ITGrid, ITInput, ITLoader, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { FaSave } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { PanelCard } from "@shared/ui/panel-card";
import { useSettingsForm } from "../model/useSettingsForm";

interface Props {
  /** Sin `config.manage` el formulario es de solo lectura. */
  canManage: boolean;
  onSaved?: () => void;
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function SettingsForm({ canManage, onSaved }: Props) {
  const { t } = useTranslation(["config", "common"]);
  const fx = useSettingsForm(onSaved);
  const v = fx.values;

  if (fx.loading) return <ITLoader />;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void fx.save();
      }}
    >
      <ITFlex direction="column" gap={4}>
        {fx.error && <ITAlert variant="error">{fx.error}</ITAlert>}
        {!canManage && <ITAlert variant="info">{t("settings.readOnly")}</ITAlert>}

        <PanelCard title={t("settings.school")}>
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="SCHOOL_NAME"
                label={t("settings.SCHOOL_NAME")}
                value={v.SCHOOL_NAME}
                disabled={!canManage}
                onChange={(e) => fx.set("SCHOOL_NAME", e.target.value)}
              />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="SCHOOL_EMAIL"
                type="email"
                label={t("settings.SCHOOL_EMAIL")}
                value={v.SCHOOL_EMAIL}
                disabled={!canManage}
                onChange={(e) => fx.set("SCHOOL_EMAIL", e.target.value)}
              />
            </ITGrid>
            <ITGrid item xs={12} md={8}>
              <ITInput
                name="SCHOOL_ADDRESS"
                label={t("settings.SCHOOL_ADDRESS")}
                value={v.SCHOOL_ADDRESS}
                disabled={!canManage}
                onChange={(e) => fx.set("SCHOOL_ADDRESS", e.target.value)}
              />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput
                name="SCHOOL_PHONE"
                label={t("settings.SCHOOL_PHONE")}
                value={v.SCHOOL_PHONE}
                disabled={!canManage}
                onChange={(e) => fx.set("SCHOOL_PHONE", e.target.value)}
              />
            </ITGrid>
          </ITGrid>
        </PanelCard>

        <PanelCard title={t("settings.academic")}>
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="MIN_PASSING_GRADE"
                type="number"
                label={t("settings.MIN_PASSING_GRADE")}
                value={v.MIN_PASSING_GRADE}
                min={0}
                max={100}
                disabled={!canManage}
                onChange={(e) => fx.set("MIN_PASSING_GRADE", num(e.target.value))}
              />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="ATTENDANCE_THRESHOLD"
                type="number"
                label={t("settings.ATTENDANCE_THRESHOLD")}
                value={v.ATTENDANCE_THRESHOLD}
                min={0}
                max={100}
                disabled={!canManage}
                onChange={(e) => fx.set("ATTENDANCE_THRESHOLD", num(e.target.value))}
              />
            </ITGrid>
          </ITGrid>
        </PanelCard>

        <PanelCard title={t("settings.finance")}>
          <ITFlex direction="column" gap={3}>
            <ITCheckbox
              name="LATE_FEE_enabled"
              label={t("settings.LATE_FEE_enabled")}
              checked={v.LATE_FEE.enabled}
              disabled={!canManage}
              onChange={(enabled) => fx.set("LATE_FEE", { ...v.LATE_FEE, enabled })}
            />
            <ITGrid container columns={12} spacing={4}>
              <ITGrid item xs={12} md={6}>
                <ITInput
                  name="LATE_FEE_dailyRate"
                  type="number"
                  decimals={4}
                  label={t("settings.LATE_FEE_dailyRate")}
                  value={v.LATE_FEE.dailyRate}
                  disabled={!canManage || !v.LATE_FEE.enabled}
                  onChange={(e) => fx.set("LATE_FEE", { ...v.LATE_FEE, dailyRate: num(e.target.value) })}
                />
              </ITGrid>
              <ITGrid item xs={12} md={6}>
                <ITInput
                  name="LATE_FEE_graceDays"
                  type="number"
                  label={t("settings.LATE_FEE_graceDays")}
                  value={v.LATE_FEE.graceDays}
                  disabled={!canManage || !v.LATE_FEE.enabled}
                  onChange={(e) =>
                    fx.set("LATE_FEE", { ...v.LATE_FEE, graceDays: Math.trunc(num(e.target.value)) })
                  }
                />
              </ITGrid>
            </ITGrid>
          </ITFlex>
        </PanelCard>

        <PanelCard title={t("settings.system")}>
          <div className="max-w-xs">
            <ITSelect
              name="LANGUAGE"
              label={t("settings.LANGUAGE")}
              value={v.LANGUAGE}
              disabled={!canManage}
              options={[
                { value: "es", label: t("settings.languages.es") },
                { value: "en", label: t("settings.languages.en") },
              ]}
              onChange={(e) => fx.set("LANGUAGE", e.target.value as "es" | "en")}
            />
          </div>
        </PanelCard>

        {canManage && (
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" disabled={!fx.dirty} onClick={fx.reset}>
              {t("common:actions.cancel")}
            </ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={!fx.dirty || fx.saving}>
              <ITFlex align="center" gap={1}>
                <FaSave size={11} />
                <ITText className="font-bold text-[11px]">
                  {fx.saving ? t("common:actions.saving") : t("common:actions.save")}
                </ITText>
              </ITFlex>
            </ITButton>
          </ITFlex>
        )}
      </ITFlex>
    </form>
  );
}
