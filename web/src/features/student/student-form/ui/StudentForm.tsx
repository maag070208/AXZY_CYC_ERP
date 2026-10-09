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
              <ITInput name="nombres" label={t("form.nombres")} value={f.nombres} required error={e.nombres}
                onChange={(ev) => fx.set("nombres", ev.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="apellidoPaterno" label={t("form.apellidoPaterno")} value={f.apellidoPaterno} required
                error={e.apellidoPaterno} onChange={(ev) => fx.set("apellidoPaterno", ev.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="apellidoMaterno" label={t("form.apellidoMaterno")} value={f.apellidoMaterno}
                onChange={(ev) => fx.set("apellidoMaterno", ev.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="curp" label={t("form.curp")} value={f.curp} required maxLength={18} error={e.curp}
                onChange={(ev) => fx.set("curp", ev.target.value.toUpperCase())} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITDatePicker name="fechaNacimiento" label={t("form.fechaNacimiento")} required
                value={f.fechaNacimiento ? fromDay(f.fechaNacimiento) : undefined}
                maxDate={new Date()} error={e.fechaNacimiento}
                onChange={(ev) => fx.set("fechaNacimiento", pickDay(ev.target.value))} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITSelect name="genero" label={t("form.genero")} value={f.genero}
                options={(["M", "F", "OTRO"] as const).map((g) => ({ value: g, label: t(`genders.${g}`) }))}
                onChange={(ev) => fx.set("genero", ev.target.value as typeof f.genero)} />
            </ITGrid>
            {!fx.isEdit && (
              <ITGrid item xs={12} md={4}>
                <ITDatePicker name="fechaIngreso" label={t("form.fechaIngreso")}
                  value={f.fechaIngreso ? fromDay(f.fechaIngreso) : undefined}
                  onChange={(ev) => fx.set("fechaIngreso", pickDay(ev.target.value))} />
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
              <ITInput name="telefono" label={t("form.telefono")} value={f.telefono} error={e.telefono}
                onChange={(ev) => fx.set("telefono", ev.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="direccion" label={t("form.direccion")} value={f.direccion}
                onChange={(ev) => fx.set("direccion", ev.target.value)} />
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
                        <ITInput name={`guardian-${index}-nombre`} label={t("form.guardianNombre")} value={g.nombre}
                          required error={rowErrors.nombre}
                          onChange={(ev) => fx.setGuardian(index, { nombre: ev.target.value })} />
                      </ITGrid>
                      <ITGrid item xs={12} md={2}>
                        <ITInput name={`guardian-${index}-parentesco`} label={t("form.parentesco")} value={g.parentesco}
                          required error={rowErrors.parentesco}
                          onChange={(ev) => fx.setGuardian(index, { parentesco: ev.target.value })} />
                      </ITGrid>
                      <ITGrid item xs={12} md={3}>
                        <ITInput name={`guardian-${index}-telefono`} label={t("form.telefono")} value={g.telefono}
                          required error={rowErrors.telefono}
                          onChange={(ev) => fx.setGuardian(index, { telefono: ev.target.value })} />
                      </ITGrid>
                      <ITGrid item xs={12} md={3}>
                        <ITInput name={`guardian-${index}-email`} type="email" label={t("form.email")} value={g.email}
                          error={rowErrors.email}
                          onChange={(ev) => fx.setGuardian(index, { email: ev.target.value })} />
                      </ITGrid>
                    </ITGrid>
                    <ITFlex justify="between" align="center" className="mt-2">
                      <ITCheckbox name={`guardian-${index}-payer`} label={t("form.responsablePago")}
                        checked={g.esResponsablePago}
                        onChange={(checked) => fx.setGuardian(index, { esResponsablePago: checked })} />
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
