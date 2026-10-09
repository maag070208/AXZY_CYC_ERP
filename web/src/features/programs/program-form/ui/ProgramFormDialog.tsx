import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDialog, ITFlex, ITGrid, ITInput, ITSelect } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@app/toast/useNotify";
import { programApi, PERIOD_TYPES, type PeriodType, type Program, type ProgramDetail } from "@entities/program";
import { validateRequired } from "@shared/validation";

interface Props {
  isOpen: boolean;
  program: Program | null;
  onClose: () => void;
  onSaved: (program: ProgramDetail, created: boolean) => void;
}

type Errors = Partial<Record<"code" | "name" | "periodCount" | "monthlyFee" | "enrollmentFee", string>>;

/** Alta/edición de una carrera con sus costos y esquema de periodos (M22). */
export default function ProgramFormDialog({ isOpen, program, onClose, onSaved }: Props) {
  const { t } = useTranslation(["programs", "common"]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [periodType, setPeriodType] = useState<PeriodType>("QUADRIMESTER");
  const [periodCount, setPeriodCount] = useState("3");
  const [monthsPerPeriod, setMonthsPerPeriod] = useState("");
  const [monthlyFee, setMonthlyFee] = useState("0");
  const [enrollmentFee, setEnrollmentFee] = useState("0");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCode(program?.code ?? "");
    setName(program?.name ?? "");
    setDescription(program?.description ?? "");
    setPeriodType(program?.periodType ?? "QUADRIMESTER");
    setPeriodCount(String(program?.periodCount ?? 3));
    setMonthsPerPeriod(program ? String(program.monthsPerPeriod) : "");
    setMonthlyFee(String(program?.monthlyFee ?? 0));
    setEnrollmentFee(String(program?.enrollmentFee ?? 0));
    setErrors({});
    setError(null);
  }, [program, isOpen]);

  const save = async () => {
    const next: Errors = {
      code: program || /^[A-Z0-9-]{2,30}$/.test(code.trim()) ? undefined : t("form.badCode"),
      name: validateRequired(name, t("form.name")) ?? undefined,
      periodCount: Number(periodCount) >= 1 && Number(periodCount) <= 20 ? undefined : t("form.badCount"),
      monthlyFee: Number(monthlyFee) >= 0 ? undefined : t("form.badFee"),
      enrollmentFee: Number(enrollmentFee) >= 0 ? undefined : t("form.badFee"),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    setError(null);
    try {
      const data = {
        name: name.trim(),
        description: description.trim() || null,
        periodType,
        periodCount: Number(periodCount),
        monthsPerPeriod: monthsPerPeriod ? Number(monthsPerPeriod) : null,
        monthlyFee: Number(monthlyFee),
        enrollmentFee: Number(enrollmentFee),
      };
      const saved = program
        ? await programApi.update(program.id, data)
        : await programApi.create({ ...data, code: code.trim().toUpperCase() });
      onSaved(saved, !program);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = program ? t("form.titleEdit") : t("form.titleNew");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-2xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={4}>
              <ITInput name="code" label={t("form.code")} value={code} required disabled={!!program} error={errors.code} maxLength={30} placeholder="MEC-DIESEL" onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </ITGrid>
            <ITGrid item xs={12} md={8}>
              <ITInput name="name" label={t("form.name")} value={name} required error={errors.name} maxLength={150} onChange={(e) => setName(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={5}>
              <ITSelect name="periodType" label={t("form.periodType")} value={periodType}
                options={PERIOD_TYPES.map((p) => ({ value: p, label: t(`periodTypes.${p}`) }))}
                onChange={(e) => setPeriodType(e.target.value as PeriodType)} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITInput name="periodCount" type="number" label={t("form.periodCount")} value={periodCount} required error={errors.periodCount} onChange={(e) => setPeriodCount(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={6} md={4}>
              <ITInput name="monthsPerPeriod" type="number" label={t("form.monthsPerPeriod")} value={monthsPerPeriod} placeholder={t("form.auto")} onChange={(e) => setMonthsPerPeriod(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput name="monthlyFee" type="number" label={t("form.monthlyFee")} value={monthlyFee} required error={errors.monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput name="enrollmentFee" type="number" label={t("form.enrollmentFee")} value={enrollmentFee} required error={errors.enrollmentFee} onChange={(e) => setEnrollmentFee(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITInput name="description" label={t("form.description")} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
            </ITGrid>
          </ITGrid>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>{t("common:actions.save")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
