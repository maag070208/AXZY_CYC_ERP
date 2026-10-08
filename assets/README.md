# Assets de marca — CYC Instituto Técnico Automotriz

Kit de marca **canónico** del proyecto. La web consume una copia de lo que
necesita (Vite no puede importar fuera de su raíz y la imagen Docker solo tiene
el contexto de `web/`), así que aquí vive la fuente de verdad y se sincroniza
hacia `web/`.

## Contenido

| Carpeta | Uso |
|---|---|
| `web/svg/` | Logos vectoriales (horizontal, stacked, wordmark, mark) en variantes color, black, white y dark |
| `web/png/` | Mismas variantes en PNG a varias resoluciones + `og-image` (social) |
| `web/favicon/` | Favicons, `site.webmanifest` y `head-snippet.html` |
| `lottie/` | Logo animado (`cyc-logo-animated`, `-dark`, `cyc-logo-mark-animated`) + `preview.html` |
| `ios/`, `android/` | Íconos de app móvil (no usados por la web) |
| `preview-sheet.png` | Hoja de referencia visual de toda la marca |

## Colores y tokens

- **Color de marca (theme-color):** `#3172F3`.
- El UI kit se alimenta por `--it-*`; el color de marca se aplica en
  `web/src/app/main.tsx` (`ITThemeProvider`).

## Cómo se usa en la web (`web/`)

- **Favicons y manifest:** en `web/public/` (raíz del sitio) y referenciados en
  `web/index.html`. Es la copia de `assets/web/favicon/*`.
- **Logos SVG:** copiados a `web/src/shared/assets/logos/`; se importan como
  módulos (`import logo from "@shared/assets/logos/logo-mark.svg"`). Se usan en el
  topbar (`PrivateRoutes`) y en el acceso (`LoginPage`).
- **Lottie:** copiados a `web/src/shared/assets/lottie/` y reproducidos por
  `web/src/shared/ui/lottie-loader` (`<LottieLoader animation="logo" size={150} />`).
- **Open Graph:** `og-image-1200x630.png` en `web/public/`.

## Sincronizar cambios de marca

```bash
# logos
cp assets/web/svg/*.svg web/src/shared/assets/logos/
# lottie
cp assets/lottie/cyc-logo-animated.json assets/lottie/cyc-logo-animated-dark.json \
   assets/lottie/cyc-logo-mark-animated.json web/src/shared/assets/lottie/
# favicons + og
cp assets/web/favicon/{favicon.ico,favicon.svg,apple-touch-icon.png,android-chrome-192x192.png,android-chrome-512x512.png,maskable-512x512.png,site.webmanifest} web/public/
cp assets/web/png/og-image-1200x630.png assets/web/png/og-image-dark-1200x630.png web/public/
```
