import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { usersApi } from "@entities/user";
import { permissionApi, type RoleAdmin } from "@entities/permission";
import { validateEmail, validateMinLength, validateRequired } from "@shared/validation";
import { i18n } from "@shared/i18n";

export interface UserFormValues {
  username: string;
  name: string;
  email: string;
  password: string;
  role: string;
  active: boolean;
}

const EMPTY: UserFormValues = {
  username: "",
  name: "",
  email: "",
  password: "",
  role: "",
  active: true,
};

export interface RoleOption {
  value: string;
  label: string;
}

/**
 * Formulario de cuenta (alta/edición). Sin argumentos toma el id de la ruta
 * (`/users/:id`); la edición le puede pasar el id explícito.
 */
export const useUserForm = (userId?: string) => {
  const { id: routeId } = useParams<{ id: string }>();
  const id = userId ?? routeId;
  const isEdit = Boolean(id);
  const { t: tt } = useTranslation(["users", "common"]);

  const [form, setForm] = useState<UserFormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<RoleAdmin[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catálogo de roles dinámico (`GET /permissions/roles`).
  useEffect(() => {
    permissionApi
      .roles()
      .then(setRoles)
      .catch(() => setRoles([]));
  }, []);

  const handleField = (field: keyof UserFormValues, value: string | boolean) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateField = (field: keyof UserFormValues, value: string): string | null => {
    switch (field) {
      case "username": {
        const required = validateRequired(value, i18n.t("users:form.username"));
        if (required) return required;
        return validateMinLength(value, 3, i18n.t("users:form.username"));
      }
      case "name":
        return validateRequired(value, i18n.t("users:form.name"));
      case "email":
        return validateEmail(value);
      case "password":
        if (!isEdit) {
          const required = validateRequired(value, i18n.t("users:form.password"));
          if (required) return required;
          return validateMinLength(value, 6, i18n.t("users:form.password"));
        }
        return value && value.length < 6
          ? i18n.t("users:form.validation.passwordMin", { min: 6 })
          : null;
      case "role":
        return validateRequired(value, i18n.t("users:form.role"));
      default:
        return null;
    }
  };

  const handleBlur = (field: keyof UserFormValues) => {
    const err = validateField(field, String(form[field] ?? ""));
    setErrors((prev) => {
      const next = { ...prev };
      if (err) next[field] = err;
      else delete next[field];
      return next;
    });
  };

  const validate = (): boolean => {
    const fields: (keyof UserFormValues)[] = ["username", "name", "email", "role"];
    if (!isEdit) fields.push("password");
    const e: Record<string, string> = {};
    for (const field of fields) {
      const err = validateField(field, String(form[field] ?? ""));
      if (err) e[field] = err;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (): Promise<boolean> => {
    if (!validate()) return false;
    setSaving(true);
    setError(null);
    try {
      if (isEdit && id) {
        await usersApi.update(id, {
          username: form.username,
          name: form.name,
          email: form.email || null,
          role: form.role,
          active: form.active,
        });
      } else {
        await usersApi.create({
          username: form.username,
          name: form.name,
          email: form.email || undefined,
          password: form.password,
          role: form.role,
        });
      }
      return true;
    } catch (e: any) {
      setError(e?.message ?? i18n.t("common:errors.save"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !!form.username && !!form.name && (isEdit || !!form.password);

  return {
    isEdit,
    id,
    form,
    errors,
    saving,
    error,
    setError,
    handleField,
    handleBlur,
    handleSubmit,
    validateField,
    canSubmit,
    tt,
    roleOptions: roles
      .filter((role) => role.active)
      .map<RoleOption>((role) => ({ value: role.key, label: role.name })),
  };
};
