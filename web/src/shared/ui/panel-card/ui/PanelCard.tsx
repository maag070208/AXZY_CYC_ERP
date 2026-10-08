import type { ReactNode } from "react";
import { ITCard, ITFlex, ITText } from "@axzydev/axzy_ui_system";

interface Props {
  title?: string;
  /** Texto de apoyo bajo el título. */
  description?: string;
  /** Acciones a la derecha del encabezado (botones, badges). */
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/**
 * Tarjeta de sección con el mismo estilo de la casa: `ITCard` con título
 * grande, borde suave y encabezado opcional con descripción y acciones.
 */
export default function PanelCard({ title, description, actions, className = "", children }: Props) {
  return (
    <ITCard title={title} className={`!p-5 border border-slate-200 ${className}`}>
      {(description || actions) && (
        <ITFlex
          align="center"
          justify="between"
          wrap="wrap"
          gap={2}
          className={children ? "mb-4" : undefined}
        >
          {description ? <ITText className="text-[12px] text-slate-500">{description}</ITText> : <span />}
          {actions && (
            <ITFlex align="center" gap={2} wrap="wrap">
              {actions}
            </ITFlex>
          )}
        </ITFlex>
      )}
      {children}
    </ITCard>
  );
}
