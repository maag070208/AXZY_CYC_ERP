import { useEffect, useState } from "react";
import { usersApi, type User } from "@entities/user";
import { errorMessage } from "@app/toast/useNotify";
import { validateEmail, validateMinLength, validateRequired } from "@shared/validation";
import { i18n } from "@shared/i18n";
import { PASSWORD_MIN_LENGTH } from "@shared/lib/password";

export interface UserFormValues {
  username: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  roles: string[];
}

const EMPTY: UserFormValues = { username: "", name: "", email: "", phone: "", password: "", roles: [] };

const fromUser = (user: User): UserFormValues => ({
  username: user.username,
  name: user.name,
  email: user.email,
  phone: user.phone ?? "",
  password: "",
  roles: [...user.roles],
});

type Field = keyof UserFormValues;

/**
 * Alta/edición de una cuenta. En edición no se cambian `username` ni contraseña
 * (la temporal tiene su propia acción); los roles reemplazan a los actuales.
 */
export const useUserForm = (user: User | null, onSaved: (user: User) => void) => {
  const isEdit = !!user;
  const [form, setForm] = useState<UserFormValues>(user ? fromUser(user) : EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(user ? fromUser(user) : EMPTY);
    setErrors({});
    setError(null);
  }, [user]);

  const validateField = (field: Field, values: UserFormValues): string | null => {
    switch (field) {
      case "username":
        return isEdit ? null : validateMinLength(values.username, 3, i18n.t("users:form.username"));
      case "name":
        return validateRequired(values.name, i18n.t("users:form.name"));
      case "email":
        return validateRequired(values.email, i18n.t("users:form.email")) ?? validateEmail(values.email);
      case "password":
        if (isEdit) return null;
        return values.password.length >= PASSWORD_MIN_LENGTH
          ? null
          : i18n.t("users:form.validation.passwordMin", { min: PASSWORD_MIN_LENGTH });
      case "roles":
        return values.roles.length > 0 ? null : i18n.t("users:form.validation.rolesRequired");
      default:
        return null;
    }
  };

  const setField = <K extends Field>(field: K, value: UserFormValues[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const toggleRole = (role: string, checked: boolean) =>
    setField(
      "roles",
      checked ? [...new Set([...form.roles, role])] : form.roles.filter((key) => key !== role)
    );

  const blur = (field: Field) => {
    const message = validateField(field, form);
    setErrors((prev) => ({ ...prev, [field]: message ?? undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<Field, string>> = {};
    for (const field of ["username", "name", "email", "password", "roles"] as Field[]) {
      const message = validateField(field, form);
      if (message) next[field] = message;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (): Promise<boolean> => {
    if (!validate()) return false;
    setSaving(true);
    setError(null);
    try {
      const saved = isEdit
        ? await usersApi.update(user.id, {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim() || null,
            ...(sameRoles(user.roles, form.roles) ? {} : { roles: form.roles }),
          })
        : await usersApi.create({
            username: form.username.trim(),
            name: form.name.trim(),
            email: form.email.trim(),
            password: form.password,
            roles: form.roles,
            ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          });
      onSaved(saved);
      return true;
    } catch (err) {
      setError(errorMessage(err, i18n.t("common:errors.save")));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { isEdit, form, errors, saving, error, setField, toggleRole, blur, submit };
};

const sameRoles = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((role) => b.includes(role));
