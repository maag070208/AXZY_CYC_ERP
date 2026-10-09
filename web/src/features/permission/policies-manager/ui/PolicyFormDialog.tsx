import { useEffect, useState } from "react";
import {
  ITAlert,
  ITButton,
  ITCheckbox,
  ITDialog,
  ITFlex,
  ITGrid,
  ITInput,
  ITSelect,
  ITText,
} from "@axzydev/axzy_ui_system";
import { FaPlus, FaTrash } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import {
  POLICY_OPERATORS,
  permissionApi,
  type Policy,
  type PolicyAction,
  type PolicyEffect,
  type PolicyOperator,
  type RoleAdmin,
  roleLabel,
} from "@entities/permission";
import { dyn } from "@shared/i18n";
import { errorMessage } from "@app/toast/useNotify";
import { formatPolicyValue, parsePolicyValue } from "../model/policyValue";

interface Props {
  isOpen: boolean;
  policy: Policy | null;
  actions: PolicyAction[];
  roles: RoleAdmin[];
  onClose: () => void;
  onSaved: (policy: Policy, created: boolean) => void;
}

interface ConditionDraft {
  field: string;
  operator: PolicyOperator;
  value: string;
}

const POLICY_KEY = /^[a-z][a-z0-9_]*$/;

export default function PolicyFormDialog({ isOpen, policy, actions, roles, onClose, onSaved }: Props) {
  const { t } = useTranslation(["roles", "common"]);
  const tc = dyn(t);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [action, setAction] = useState("");
  const [effect, setEffect] = useState<PolicyEffect>("DENY");
  const [priority, setPriority] = useState("100");
  const [active, setActive] = useState(true);
  const [policyRoles, setPolicyRoles] = useState<string[]>([]);
  const [conditions, setConditions] = useState<ConditionDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setKey(policy?.key ?? "");
    setName(policy?.name ?? "");
    setDescription(policy?.description ?? "");
    setAction(policy?.action ?? actions[0]?.key ?? "");
    setEffect(policy?.effect ?? "DENY");
    setPriority(String(policy?.priority ?? 100));
    setActive(policy?.active ?? true);
    setPolicyRoles(policy?.roles ?? []);
    setConditions(
      (policy?.conditions ?? []).map((c) => ({ field: c.field, operator: c.operator, value: formatPolicyValue(c.value) }))
    );
    setError(null);
  }, [policy, actions, isOpen]);

  const fields = actions.find((a) => a.key === action)?.fields ?? [];
  const canSave = !!name.trim() && !!action && (policy ? true : POLICY_KEY.test(key));

  const updateCondition = (index: number, patch: Partial<ConditionDraft>) =>
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const save = async () => {
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      action,
      effect,
      priority: Number.parseInt(priority, 10) || 0,
      active,
      roles: policyRoles,
      conditions: conditions
        .filter((c) => c.field)
        .map((c) => ({ field: c.field, operator: c.operator, value: parsePolicyValue(c.value) })),
    };
    try {
      if (policy) onSaved(await permissionApi.updatePolicy(policy.id, body), false);
      else onSaved(await permissionApi.createPolicy({ key, ...body }), true);
    } catch (err) {
      setError(errorMessage(err, t("common:errors.save")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ITDialog
      isOpen={isOpen}
      onClose={onClose}
      title={policy ? t("policies.edit") : t("policies.new")}
      className="w-full max-w-3xl"
    >
      <form
        role="dialog"
        aria-label={policy ? t("policies.edit") : t("policies.new")}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) void save();
        }}
      >
        <ITFlex direction="column" gap={4}>
          {error && <ITAlert variant="error">{error}</ITAlert>}
          <ITGrid container columns={12} spacing={4}>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="policyKey"
                label={t("policies.key")}
                value={key}
                onChange={(e) => setKey(e.target.value.toLowerCase())}
                disabled={!!policy}
                required
                error={!policy && key && !POLICY_KEY.test(key) ? t("policies.keyHint") : undefined}
              />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITInput
                name="policyName"
                label={t("policies.name")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </ITGrid>
            <ITGrid item xs={12}>
              <ITInput
                name="policyDescription"
                label={t("policies.description")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </ITGrid>
            <ITGrid item xs={12} md={6}>
              <ITSelect
                name="policyAction"
                label={t("policies.action")}
                value={action}
                options={actions.map((a) => ({ value: a.key, label: `${a.key} — ${a.description}` }))}
                onChange={(e) => {
                  setAction(e.target.value);
                  setConditions([]);
                }}
                required
              />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITSelect
                name="policyEffect"
                label={t("policies.effect")}
                value={effect}
                options={[
                  { value: "DENY", label: t("policies.DENY") },
                  { value: "ALLOW", label: t("policies.ALLOW") },
                ]}
                onChange={(e) => setEffect(e.target.value as PolicyEffect)}
              />
            </ITGrid>
            <ITGrid item xs={6} md={3}>
              <ITInput
                name="policyPriority"
                type="number"
                label={t("policies.priority")}
                value={priority}
                onChange={(e) => setPriority(String(e.target.value))}
              />
            </ITGrid>
          </ITGrid>

          <fieldset>
            <ITText as="legend" className="text-[12px] font-bold text-slate-700">
              {t("policies.roles")}
            </ITText>
            <ITText className="block text-[11px] text-slate-400">{t("policies.rolesHint")}</ITText>
            <ITFlex gap={4} wrap="wrap" className="mt-2">
              {roles.map((role) => (
                <ITCheckbox
                  key={role.key}
                  name={`policy-role-${role.key}`}
                  label={roleLabel(role)}
                  checked={policyRoles.includes(role.key)}
                  onChange={(checked) =>
                    setPolicyRoles((prev) =>
                      checked ? [...new Set([...prev, role.key])] : prev.filter((k) => k !== role.key)
                    )
                  }
                />
              ))}
            </ITFlex>
          </fieldset>

          <fieldset>
            <ITFlex align="center" justify="between">
              <ITText as="legend" className="text-[12px] font-bold text-slate-700">
                {t("policies.conditions")}
              </ITText>
              <ITButton
                variant="text"
                color="primary"
                size="sm"
                disabled={fields.length === 0}
                onClick={() =>
                  setConditions((prev) => [...prev, { field: fields[0]?.path ?? "", operator: "eq", value: "" }])
                }
              >
                <ITFlex align="center" gap={1}>
                  <FaPlus size={10} />
                  <ITText className="text-[11px] font-bold">{t("policies.addCondition")}</ITText>
                </ITFlex>
              </ITButton>
            </ITFlex>
            <ITText className="block text-[11px] text-slate-400">{t("policies.valueHint")}</ITText>
            {conditions.length === 0 ? (
              <ITText className="mt-2 block text-[12px] text-slate-500">{t("policies.noConditions")}</ITText>
            ) : (
              <ITFlex direction="column" gap={2} className="mt-2">
                {conditions.map((condition, index) => (
                  <ITFlex key={index} gap={2} align="end">
                    <ITSelect
                      name={`condition-field-${index}`}
                      label={t("policies.field")}
                      value={condition.field}
                      options={fields.map((f) => ({ value: f.path, label: f.path }))}
                      onChange={(e) => updateCondition(index, { field: e.target.value })}
                    />
                    <ITSelect
                      name={`condition-operator-${index}`}
                      label={t("policies.operator")}
                      value={condition.operator}
                      options={POLICY_OPERATORS.map((op) => ({ value: op, label: tc(`operators.${op}`) }))}
                      onChange={(e) => updateCondition(index, { operator: e.target.value as PolicyOperator })}
                    />
                    <ITInput
                      name={`condition-value-${index}`}
                      label={t("policies.value")}
                      value={condition.value}
                      onChange={(e) => updateCondition(index, { value: e.target.value })}
                    />
                    <ITButton
                      variant="text"
                      color="danger"
                      size="sm"
                      ariaLabel={t("common:actions.remove")}
                      onClick={() => setConditions((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <FaTrash size={11} />
                    </ITButton>
                  </ITFlex>
                ))}
              </ITFlex>
            )}
          </fieldset>

          <ITCheckbox name="policyActive" label={t("policies.active")} checked={active} onChange={setActive} />

          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>
              {t("common:actions.cancel")}
            </ITButton>
            <ITButton type="submit" variant="filled" color="primary" disabled={saving || !canSave}>
              {saving ? t("common:actions.saving") : t("common:actions.save")}
            </ITButton>
          </ITFlex>
        </ITFlex>
      </form>
    </ITDialog>
  );
}
