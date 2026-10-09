import {
  ITAlert,
  ITButton,
  ITCheckbox,
  ITConfirmDialog,
  ITDatePicker,
  ITFlex,
  ITGrid,
  ITInput,
  ITSelect,
  ITText,
} from "@axzydev/axzy_ui_system";
import { FaPlus, FaSave, FaTrash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import type { Student } from "@entities/student";
import { PanelCard } from "@shared/ui/panel-card";
import { fromDay, toDay } from "@shared/lib/day";
import { useStudentForm } from "../model/useStudentForm";

interface Props {
  student: Student | null;
  onSaved: (student: Student, created: boolean) => void;
  onCancel: () => void;
}

const pickDay = (value: unknown): string => (value instanceof Date && !Number.isNaN(value.getTime()) ? toDay(value) : "");

export default function StudentForm({ student, onSaved, onCancel }: Props) {
  const { t } = useTranslation(["students", "common"]);
  const fx = useStudentForm(student, onSaved);
  const f = fx.form;
  const e = fx.errors;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void fx.submit();
      }}
    >
      <ITFlex direction="column" gap={4}>
        {fx.error && <ITAlert variant="error">{fx.error}</ITAlert>}

        <PanelCard title={t("form.personal")}>
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={4}>
              <ITInput name="firstNames" label={t("form.firstNames")} value={f.firstNames} required error={e.firstNames}
                onChange={(ev) => fx.set("firstNames", ev.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="paternalSurname" label={t("form.paternalSurname")} value={f.paternalSurname} required
                error={e.paternalSurname} onChange={(ev) => fx.set("paternalSurname", ev.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="maternalSurname" label={t("form.maternalSurname")} value={f.maternalSurname}
                onChange={(ev) => fx.set("maternalSurname", ev.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="curp" label={t("form.curp")} value={f.curp} required maxLength={18} error={e.curp}
                onChange={(ev) => fx.set("curp", ev.target.value.toUpperCase())} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITDatePicker name="birthDate" label={t("form.birthDate")} required
                value={f.birthDate ? fromDay(f.birthDate) : undefined}
                maxDate={new Date()} error={e.birthDate}
                onChange={(ev) => fx.set("birthDate", pickDay(ev.target.value))} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITSelect name="gender" label={t("form.gender")} value={f.gender}
                options={(["M", "F", "OTHER"] as const).map((g) => ({ value: g, label: t(`genders.${g}`) }))}
                onChange={(ev) => fx.set("gender", ev.target.value as typeof f.gender)} />
            </ITGrid>
            {!fx.isEdit && (
              <ITGrid item xs={12} md={4}>
                <ITDatePicker name="enrollmentDate" label={t("form.enrollmentDate")}
                  value={f.enrollmentDate ? fromDay(f.enrollmentDate) : undefined}
                  onChange={(ev) => fx.set("enrollmentDate", pickDay(ev.target.value))} />
                <ITText className="mt-1 block text-[11px] text-slate-400">{t("form.fechaIngresoHint")}</ITText>
              </ITGrid>
            )}
          </ITGrid>
        </PanelCard>

        <PanelCard title={t("form.contact")}>
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={4}>
              <ITInput name="email" type="email" label={t("form.email")} value={f.email} error={e.email}
                onChange={(ev) => fx.set("email", ev.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="phone" label={t("form.phone")} value={f.phone} error={e.phone}
                onChange={(ev) => fx.set("phone", ev.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="address" label={t("form.address")} value={f.address}
                onChange={(ev) => fx.set("address", ev.target.value)} />
            </ITGrid>
          </ITGrid>
        </PanelCard>

        <PanelCard
          title={t("form.guardians")}
          description={t("form.guardiansHint")}
          actions={
            <ITButton variant="outlined" color="primary" onClick={fx.addGuardian}>
              <ITFlex align="center" gap={1}>
                <FaPlus size={11} />
                <ITText className="text-[11px] font-bold">{t("form.addGuardian")}</ITText>
              </ITFlex>
            </ITButton>
          }
        >
          {e.guardians && (
            <div className="mb-3">
              <ITAlert variant="warning">{e.guardians}</ITAlert>
            </div>
          )}
          {f.guardians.length === 0 ? (
            <ITText className="text-[12px] text-slate-500">{t("form.noGuardians")}</ITText>
          ) : (
            <ITFlex direction="column" gap={3}>
              {f.guardians.map((g, index) => {
                const rowErrors = e.guardianRows?.[index] ?? {};
                return (
                  <div key={index} className="rounded-xl border border-slate-200 p-3" data-guardian={index}>
                    <ITGrid container columns={12} spacing={3}>
                      <ITGrid item xs={12} md={4}>
                        <ITInput name={`guardian-${index}-name`} label={t("form.guardianNombre")} value={g.name}
                          required error={rowErrors.name}
                          onChange={(ev) => fx.setGuardian(index, { name: ev.target.value })} />
                      </ITGrid>
                      <ITGrid item xs={12} md={2}>
                        <ITInput name={`guardian-${index}-relationship`} label={t("form.relationship")} value={g.relationship}
                          required error={rowErrors.relationship}
                          onChange={(ev) => fx.setGuardian(index, { relationship: ev.target.value })} />
                      </ITGrid>
                      <ITGrid item xs={12} md={3}>
                        <ITInput name={`guardian-${index}-phone`} label={t("form.phone")} value={g.phone}
                          required error={rowErrors.phone}
                          onChange={(ev) => fx.setGuardian(index, { phone: ev.target.value })} />
                      </ITGrid>
                      <ITGrid item xs={12} md={3}>
                        <ITInput name={`guardian-${index}-email`} type="email" label={t("form.email")} value={g.email}
                          error={rowErrors.email}
                          onChange={(ev) => fx.setGuardian(index, { email: ev.target.value })} />
                      </ITGrid>
                    </ITGrid>
                    <ITFlex justify="between" align="center" className="mt-2">
                      <ITCheckbox name={`guardian-${index}-payer`} label={t("form.responsablePago")}
                        checked={g.isPaymentResponsible}
                        onChange={(checked) => fx.setGuardian(index, { isPaymentResponsible: checked })} />
                      <ITButton variant="text" color="danger" size="sm" ariaLabel={`${t("form.removeGuardian")} ${index + 1}`}
                        onClick={() => fx.removeGuardian(index)}>
                        <FaTrash size={11} />
                      </ITButton>
                    </ITFlex>
                  </div>
                );
              })}
            </ITFlex>
          )}
        </PanelCard>

        <ITFlex justify="end" gap={2}>
          <ITButton variant="outlined" color="secondary" onClick={onCancel}>
            {t("form.cancel")}
          </ITButton>
          <ITButton type="submit" variant="filled" color="primary" disabled={fx.saving}>
            <ITFlex align="center" gap={1}>
              <FaSave size={11} />
              <ITText className="text-[11px] font-bold">{fx.saving ? t("common:actions.saving") : t("form.save")}</ITText>
            </ITFlex>
          </ITButton>
        </ITFlex>
      </ITFlex>

      <ITConfirmDialog
        isOpen={!!fx.duplicates}
        onClose={fx.cancelDuplicate}
        onConfirm={fx.confirmDuplicate}
        title={t("form.duplicateTitle")}
        message={t("form.duplicateMessage", { matriculas: (fx.duplicates ?? []).join(", ") })}
        confirmLabel={t("form.duplicateConfirm")}
        cancelLabel={t("common:actions.cancel")}
        variant="warning"
      />
    </form>
  );
}
