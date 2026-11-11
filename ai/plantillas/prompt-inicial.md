# Prompt inicial (copiar y pegar)

Adjunta `AXZY-UI-SYSTEM.md` (o `AXZY-UI-SYSTEM-compacto.md` si el contexto es corto) y usa este prompt:

---

Vas a escribir código con **AXZY UI System** (`@axzydev/axzy_ui_system`) en React + TypeScript + Tailwind v4.
El documento adjunto es la fuente de verdad: instalación real, reglas, accesibilidad, trampas, ejemplos de
producción y el catálogo completo de componentes con sus props.

Normas:
1. **No inventes props ni componentes**: si algo no está en el catálogo, dilo en vez de improvisarlo.
2. Respeta la puesta en marcha del §2 (capas de CSS, `ITThemeProvider`) y el modo oscuro por defecto.
3. Nada de colores ni textos hardcodeados; usa tokens del tema y `useITTranslation()`.
4. La accesibilidad del §12 no es opcional (nombres accesibles, sin interactivos anidados, contraste AA).
5. Revisa el §13 (trampas) antes de dar el código por bueno.
6. Cuando compongas una pantalla, sigue los patrones de `ejemplos-reales.md` (`ITLayout`, `ITPage`,
   `ITDataTable` con `fetchData`, toasts globales).

Tarea: **<describe aquí tu pantalla o componente>**

Devuelve: el/los archivos completos (no fragmentos), con imports explícitos y comentarios solo donde aporten.
