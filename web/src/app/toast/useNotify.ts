import { useCallback, useMemo } from "react";
import { useDispatch } from "react-redux";
import { showToast } from "./toast.slice";

/** Mensaje legible de un error de la API (ya viene traducido por `Accept-Language`). */
export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

/** Toasts globales (el `ToastProvider` los pinta encima de todo). */
export const useNotify = () => {
  const dispatch = useDispatch();
  const success = useCallback(
    (message: string) => dispatch(showToast({ message, type: "success" })),
    [dispatch]
  );
  const error = useCallback(
    (message: string) => dispatch(showToast({ message, type: "error", duration: 4000 })),
    [dispatch]
  );
  return useMemo(() => ({ success, error }), [success, error]);
};
