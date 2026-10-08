import { Lottie } from "lottie-react";
import type { CSSProperties } from "react";
import animatedLogo from "@shared/assets/lottie/cyc-logo-animated.json";
import animatedLogoDark from "@shared/assets/lottie/cyc-logo-animated-dark.json";
import animatedMark from "@shared/assets/lottie/cyc-logo-mark-animated.json";

/** Animaciones Lottie disponibles de la marca CYC. */
export type LottieAnimation = "logo" | "logo-dark" | "mark";

const ANIMATIONS = {
  logo: animatedLogo,
  "logo-dark": animatedLogoDark,
  mark: animatedMark,
} as const;

interface Props {
  /** Animación a mostrar (por defecto el logo animado). */
  animation?: LottieAnimation;
  /** Lado del cuadrado en px. */
  size?: number;
  /** Repetir la animación (por defecto sí). */
  loop?: boolean;
  className?: string;
  /** Etiqueta accesible. */
  label?: string;
  style?: CSSProperties;
}

/**
 * Loader de marca: la animación del logotipo (Lottie) en lugar de un spinner
 * genérico. Se usa en estados de carga y en la pantalla de acceso.
 *
 * @example
 * <LottieLoader animation="logo" size={150} />
 */
export default function LottieLoader({
  animation = "logo",
  size = 160,
  loop = true,
  className,
  label = "Cargando",
  style,
}: Props) {
  return (
    <div role="img" aria-label={label} className={className}>
      <Lottie
        src={ANIMATIONS[animation]}
        loop={loop}
        autoplay
        style={{ width: size, height: size, ...style }}
      />
    </div>
  );
}
