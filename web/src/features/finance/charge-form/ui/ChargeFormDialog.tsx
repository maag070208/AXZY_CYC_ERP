import { useEffect, useState } from "react";
import { ITAlert, ITButton, ITDatePicker, ITDialog, ITFlex, ITGrid, ITInput, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { FaTimes } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import { chargeApi, feeConceptApi, type Charge, type FeeConcept } from "@entities/finance";
import { termsApi, type Term } from "@entities/config";
import { StudentSearch, type Student } from "@entities/student";
import { errorMessage } from "@app/toast/useNotify";
import { fromDay, toDay } from "@shared/lib/day";
import { formatMoney } from "@shared/lib/money";

interface Props {
  isOpen: boolean;
  /** Alumno ya elegido (desde su estado de cuenta). */
  student?: Pick<Student, "id" | "nombreCompleto" | "studentNumber"> | null;
  onClose: () => void;
  onSaved: (charge: Charge) => void;
}

const pickDay = (value: unknown): string => (value instanceof Date && !Number.isNaN(value.getTime()) ? toDay(value) : "");

/** Cargo individual: alumno, concepto, ciclo, monto/descuento y vencimiento. */
export default function ChargeFormDialog({ isOpen, student: fixed, onClose, onSaved }: Props) {
  const { t, i18n } = useTranslation(["finance", "courses", "common"]);
  const [student, setStudent] = useState<Pick<Student, "id" | "nombreCompleto" | "studentNumber"> | null>(null);
  const [concepts, setConcepts] = useState<FeeConcept[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [conceptId, setConceptId] = useState("");
  const [termId, setTermId] = useState("");
  const [description, setDescripcion] = useState("");
  const [amount, setMonto] = useState("");
  const [discount, setDescuento] = useState("");
  const [vence, setVence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStudent(fixed ?? null);
    setConceptId("");
    setDescripcion("");
    setMonto("");
    setDescuento("");
    setVence("");
    setError(null);
    feeConceptApi.options().then(setConcepts).catch(() => setConcepts([]));
    termsApi.options().then((list) => {
      setTerms(list);
      setTermId(list.find((x) => x.active)?.id ?? "");
    }).catch(() => setTerms([]));
  }, [isOpen, fixed]);

  const concept = concepts.find((c) => c.id === conceptId);

  const save = async () => {
    if (!student || !conceptId || !vence) {
      setError(t("common:validation.required", { label: !student ? t("charges.alumno") : !conceptId ? t("charges.concepto") : t("charges.vencimiento") }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await chargeApi.create({
        studentId: student.id,
        conceptId,
        termId: termId || null,
        description: description.trim() || null,
        ...(amount !== "" && { amount: Number(amount) }),
        ...(discount !== "" && { discount: Number(discount) }),
        dueDate: vence,
      }));
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = t("charges.titleNew");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-2xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          {student ? (
            <ITFlex justify="between" align="center" className="rounded-xl border border-slate-200 px-3 py-2">
              <div>
                <ITText className="block text-[12px] font-bold text-slate-700">{student.nombreCompleto}</ITText>
                <ITText className="font-mono text-[11px] text-slate-400">{student.studentNumber}</ITText>
              </div>
              {!fixed && (
                <ITButton variant="text" color="secondary" size="sm" ariaLabel={t("common:actions.remove")} onClick={() => setStudent(null)}>
                  <FaTimes size={11} />
                </ITButton>
              )}
            </ITFlex>
          ) : (
            <StudentSearch label={t("charges.alumnoSearch")} hint={t("courses:enrollments.searchHint")} emptyText={t("courses:enrollments.noResults")}
              actionLabel={t("charges.selectStudent")} onSelect={setStudent} activeOnly={false} />
          )}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={7}>
              <ITSelect name="conceptId" label={t("charges.concepto")} value={conceptId} placeholder="—"
                options={concepts.map((c) => ({ value: c.id, label: `${c.name} · ${formatMoney(c.amount, i18n.language)}` }))}
                onChange={(e) => setConceptId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={5}>
              <ITSelect name="termId" label={t("charges.ciclo")} value={termId} placeholder="—"
                options={terms.map((x) => ({ value: x.id, label: x.name }))} onChange={(e) => setTermId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITInput name="description" label={t("charges.descripcion")} value={description} onChange={(e) => setDescripcion(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="amount" type="number" label={t("charges.monto")} value={amount}
                placeholder={concept ? String(concept.amount) : undefined} onChange={(e) => setMonto(e.target.value)} />
              <ITText className="text-[10px] text-slate-400">{t("charges.montoHint")}</ITText>
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITInput name="discount" type="number" label={t("charges.descuento")} value={discount} onChange={(e) => setDescuento(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={4}>
              <ITDatePicker name="dueDate" label={t("charges.vencimiento")} required value={vence ? fromDay(vence) : undefined}
                onChange={(e) => setVence(pickDay(e.target.value))} />
            </ITGrid>
          </ITGrid>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>{saving ? t("common:actions.saving") : t("common:actions.save")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
