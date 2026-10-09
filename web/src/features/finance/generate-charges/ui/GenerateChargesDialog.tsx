import { useEffect, useMemo, useState } from "react";
import { ITAlert, ITButton, ITDatePicker, ITDialog, ITFlex, ITGrid, ITInput, ITSelect, ITText } from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import { chargeApi, feeConceptApi, type FeeConcept } from "@entities/finance";
import { termsApi, type Term } from "@entities/config";
import { groupApi, type Group } from "@entities/group";
import { errorMessage } from "@app/toast/useNotify";
import { fromDay, toDay } from "@shared/lib/day";
import { formatMoney } from "@shared/lib/money";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDone: (result: { created: number; skipped: number }) => void;
}

const pickDay = (value: unknown): string => (value instanceof Date && !Number.isNaN(value.getTime()) ? toDay(value) : "");
const newKey = () => `gen-${crypto.randomUUID()}`;

/**
 * Generación masiva por grupo o ciclo. Cada apertura del diálogo usa su propia
 * `Idempotency-Key`: un doble clic o un reintento no duplican cargos.
 */
export default function GenerateChargesDialog({ isOpen, onClose, onDone }: Props) {
  const { t, i18n } = useTranslation(["finance", "common"]);
  const [concepts, setConcepts] = useState<FeeConcept[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [conceptId, setConceptId] = useState("");
  const [scope, setScope] = useState<"group" | "term">("group");
  const [termId, setTermId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [vence, setVence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useMemo(() => (isOpen ? newKey() : ""), [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setConceptId("");
    setScope("group");
    setGroupId("");
    setDescripcion("");
    setVence("");
    setError(null);
    feeConceptApi.options().then(setConcepts).catch(() => setConcepts([]));
    termsApi.options().then((list) => {
      setTerms(list);
      setTermId(list.find((x) => x.active)?.id ?? list[0]?.id ?? "");
    }).catch(() => setTerms([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !termId) return;
    groupApi.options({ termId }).then(setGroups).catch(() => setGroups([]));
  }, [isOpen, termId]);

  const save = async () => {
    if (!conceptId || !vence || (scope === "group" ? !groupId : !termId)) {
      setError(t("common:validation.required", { label: !conceptId ? t("charges.concepto") : !vence ? t("charges.vencimiento") : t("charges.grupo") }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onDone(await chargeApi.generate({
        conceptId, scope, fechaVencimiento: vence, descripcion: descripcion.trim() || null,
        ...(scope === "group" ? { groupId } : { termId }),
      }, idempotencyKey));
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  const title = t("charges.generateTitle");
  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-2xl">
      <form role="dialog" aria-label={title} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITText className="text-[12px] text-slate-500">{t("charges.generateHint")}</ITText>
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12}>
              <ITSelect name="conceptId" label={t("charges.concepto")} value={conceptId} placeholder="—"
                options={concepts.map((c) => ({ value: c.id, label: `${c.nombre} · ${formatMoney(c.monto, i18n.language)}` }))}
                onChange={(e) => setConceptId(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="scope" label={t("charges.scope")} value={scope}
                options={(["group", "term"] as const).map((s) => ({ value: s, label: t(`charges.scopes.${s}`) }))}
                onChange={(e) => setScope(e.target.value as "group" | "term")} />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect name="termId" label={t("charges.ciclo")} value={termId}
                options={terms.map((x) => ({ value: x.id, label: x.name }))} onChange={(e) => { setTermId(e.target.value); setGroupId(""); }} />
            </ITGrid>
            {scope === "group" && (
              <ITGrid item xs={12}>
                <ITSelect name="groupId" label={t("charges.grupo")} value={groupId} placeholder="—"
                  options={groups.map((g) => ({ value: g.id, label: `${g.courseNombre} · ${g.nombre} (${g.inscritos})` }))}
                  onChange={(e) => setGroupId(e.target.value)} />
              </ITGrid>
            )}
            <ITGrid item xs={12} md={7}>
              <ITInput name="descripcion" label={t("charges.descripcion")} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </ITGrid>
            <ITGrid item xs={12} md={5}>
              <ITDatePicker name="fechaVencimiento" label={t("charges.vencimiento")} required value={vence ? fromDay(vence) : undefined}
                onChange={(e) => setVence(pickDay(e.target.value))} />
            </ITGrid>
          </ITGrid>
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{t("common:actions.cancel")}</ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving}>{t("charges.generate")}</ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
