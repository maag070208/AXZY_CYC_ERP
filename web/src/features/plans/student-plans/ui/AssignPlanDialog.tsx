import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDatePicker, ITDialog, ITFlex, ITGrid, ITInput, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { errorMessage, useNotify } from "@app/toast/useNotify";
import { termsApi, type Term } from "@entities/config";
import { planApi, type PlanDetail, type PlanInput } from "@entities/plan";
import { programApi, type Program } from "@entities/program";
import { toDay } from "@shared/lib/day";

interface Props {
  isOpen: boolean;
  studentId: string;
  studentName?: string;
  onClose: () => void;
  onSaved: (plan: PlanDetail) => void;
}

type Errors = Partial<Record<"programId" | "startDate" | "discount", string>>;

/** Asigna un alumno a una carrera y genera su plan de pagos (M22). */
export default function AssignPlanDialog({ isOpen, studentId, studentName, onClose, onSaved }: Props) {
  const { t } = useTranslation(["programs", "common"]);
  const notify = useNotify();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [programId, setProgramId] = useState("");
  const [termId, setTermId] = useState("");
  const [start, setStart] = useState<Date>(new Date());
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setProgramId("");
    setTermId("");
    setStart(new Date());
    setDiscountPercent("");
    setDiscountAmount("");
    setDiscountReason("");
    setErrors({});
    setError(null);
    programApi.table({ page: 1, limit: 100, filters: { active: true } }).then((res) => setPrograms(res.data)).catch(() => setPrograms([]));
    termsApi.options().then(setTerms).catch(() => setTerms([]));
  }, [isOpen]);

  const save = async () => {
    const next: Errors = {
      programId: programId ? undefined : t("common:validation.required", { label: t("assign.program") }),
      discount: discountPercent && discountAmount ? t("assign.discountExclusive") : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    const data: PlanInput = {
      studentId,
      programId,
      termId: termId || null,
      startDate: toDay(start),
      ...(discountPercent ? { discountPercent: Number(discountPercent) } : {}),
      ...(discountAmount ? { discountAmount: Number(discountAmount) } : {}),
      discountReason: discountReason.trim() || null,
    };
    setSaving(true);
    setError(null);
    try {
      const plan = await planApi.create(data, crypto.randomUUID());
      notify.success(t("assign.created", { charges: plan.totals.charges }));
      onSaved(plan);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = studentName ? t("assign.title", { name: studentName }) : t("assign.titleShort");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-2xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITAlert variant="info">{t("assign.hint")}</ITAlert>
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={7}>
              <ITSelect name="programId" label={t("assign.program")} value={programId} required error={errors.programId} placeholder="—"
                options={programs.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
                onChange={(e) => setProgramId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={5}>
              <ITSelect name="termId" label={t("assign.term")} value={termId} placeholder={t("assign.noTerm")}
                options={[{ value: "", label: t("assign.noTerm") }, ...terms.map((term) => ({ value: term.id, label: term.name }))]}
                onChange={(e) => setTermId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={5}>
              <ITDatePicker name="startDate" label={t("assign.startDate")} required value={start} onChange={(e) => setStart((e.target.value as Date) ?? start)} />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITInput name="discountPercent" type="number" label={t("assign.discountPercent")} value={discountPercent} error={errors.discount} onChange={(e) => setDiscountPercent(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={6} md={4}>
              <ITInput name="discountAmount" type="number" label={t("assign.discountAmount")} value={discountAmount} error={errors.discount} onChange={(e) => setDiscountAmount(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITInput name="discountReason" label={t("assign.discountReason")} value={discountReason} maxLength={200} onChange={(e) => setDiscountReason(e.target.value)} />
            </ITGrid>
          </ITGrid>
          <ITText className="text-[11px] text-slate-400">{t("assign.footnote")}</ITText>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>{t("assign.submit")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
