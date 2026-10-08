import {
  ITCheckbox,
  ITFlex,
  ITGrid,
  ITInput,
  ITSelect,
} from "@axzydev/axzy_ui_system";
import { useTranslation } from "react-i18next";
import type { RoleOption, UserFormValues } from "../model/useUserForm";

interface Props {
  isEdit: boolean;
  form: UserFormValues;
  errors?: Record<string, string>;
  onFieldChange: (field: keyof UserFormValues, value: string | boolean) => void;
  onBlur?: (field: keyof UserFormValues) => void;
  roleOptions: RoleOption[];
}

export default function UserFormFields({
  isEdit,
  form,
  errors,
  onFieldChange,
  onBlur,
  roleOptions,
}: Props) {
  const { t: tt } = useTranslation(["users", "common"]);
  const fieldError = (key: string) => errors?.[key];

  return (
    <ITGrid container columns={12} spacing={4}>
      <ITGrid item xs={12} md={6}>
        <ITInput
          name="username"
          label={tt("form.username")}
          value={form.username}
          onChange={(e) => onFieldChange("username", e.target.value)}
          onBlur={() => onBlur?.("username")}
          required
          error={fieldError("username")}
        />
      </ITGrid>
      <ITGrid item xs={12} md={6}>
        <ITInput
          name="name"
          label={tt("form.name")}
          value={form.name}
          onChange={(e) => onFieldChange("name", e.target.value)}
          onBlur={() => onBlur?.("name")}
          required
          error={fieldError("name")}
        />
      </ITGrid>
      <ITGrid item xs={12} md={6}>
        <ITInput
          name="email"
          type="email"
          label={tt("form.email")}
          value={form.email}
          onChange={(e) => onFieldChange("email", e.target.value)}
          onBlur={() => onBlur?.("email")}
          error={fieldError("email")}
        />
      </ITGrid>
      <ITGrid item xs={12} md={6}>
        <ITSelect
          name="role"
          label={tt("form.role")}
          options={roleOptions}
          value={form.role}
          onChange={(e) => onFieldChange("role", e.target.value)}
          required
        />
      </ITGrid>
      <ITGrid item xs={12} md={6}>
        <ITInput
          name="password"
          type="password"
          label={`${tt("form.password")} ${isEdit ? "" : "*"}`}
          value={form.password}
          onChange={(e) => onFieldChange("password", e.target.value)}
          onBlur={() => onBlur?.("password")}
          required={!isEdit}
          error={fieldError("password")}
        />
      </ITGrid>
      {isEdit && (
        <ITGrid item xs={12} md={6}>
          <ITFlex align="end">
            <ITCheckbox
              name="active"
              label={tt("form.active")}
              checked={form.active}
              onChange={(checked) => onFieldChange("active", checked)}
            />
          </ITFlex>
        </ITGrid>
      )}
    </ITGrid>
  );
}
