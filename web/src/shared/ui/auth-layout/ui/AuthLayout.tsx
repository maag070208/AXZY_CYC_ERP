import type { ReactNode } from "react";
import { ITFlex, ITText } from "@axzydev/axzy_ui_system";
import { LottieLoader } from "@shared/ui/lottie-loader";

interface Props {
  children: ReactNode;
}

/** Marco de las pantallas públicas de acceso (login y recuperación). */
export default function AuthLayout({ children }: Props) {
  return (
    <ITFlex
      as="div"
      align="center"
      justify="center"
      grow
      className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 p-4"
    >
      <ITFlex direction="column" align="center" gap={6} className="w-full max-w-md">
        <LottieLoader animation="logo" size={150} />
        <ITText as="h1" className="text-center text-lg font-semibold text-slate-700">
          Sistema de Gestión Escolar
        </ITText>
        {children}
      </ITFlex>
      <ITText as="p" className="absolute bottom-4 text-xs font-medium text-slate-400">
        v{__APP_VERSION__}
      </ITText>
    </ITFlex>
  );
}
