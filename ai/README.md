# `ai/` — paquete de contexto para IA

Carpeta **autocontenida** para pegar en un modelo (Claude, ChatGPT, Cursor, Copilot, un agente propio).
No tiene enlaces relativos: cada archivo se entiende solo.

## Qué pegar según lo que necesites

| Archivo | Tamaño | Qué incluye |
| --- | --- | --- |
| `AXZY-UI-SYSTEM.md` | 150.0 KB · ~38k tokens | **Todo en uno**: guía + ejemplos de producción + catálogo completo (61 componentes) |
| `AXZY-UI-SYSTEM-compacto.md` | 65.0 KB · ~17k tokens | Igual, con el catálogo sin descripciones de props (para contextos cortos) |
| `catalogo.md` | 119.6 KB · ~31k tokens | Solo el catálogo (si ya tienes la guía pegada) |
| `catalogo.json` | 182.8 KB | El catálogo en JSON, para indexar o usar como herramienta |
| `plantillas/` | — | Reglas listas para Cursor (`.mdc`), Copilot (`copilot-instructions.md`), Claude Code (`CLAUDE.md`) y un prompt inicial |

## Cómo usarlo

- **Chat (Claude/ChatGPT)**: sube o pega `AXZY-UI-SYSTEM.md` y luego tu tarea. Si el contexto es
  limitado, usa `AXZY-UI-SYSTEM-compacto.md`.
- **Cursor**: copia `plantillas/cursor-rule.mdc` a `.cursor/rules/axzy-ui-system.mdc` del proyecto.
- **Copilot**: copia `plantillas/copilot-instructions.md` a `.github/copilot-instructions.md`.
- **Claude Code / agentes**: copia `plantillas/CLAUDE.md` a la raíz del proyecto y adjunta el bundle.
- **Prompt listo**: `plantillas/prompt-inicial.md` (rellena la tarea al final).

## Regenerar

```bash
pnpm docs:ai      # regenera docs/llm/ + este paquete (encadena ext:catalog)
```

Los datos salen del código (`src/components/**/*.props.ts` vía el compilador de TypeScript), así que no se
quedan viejos. **No edites los archivos de esta carpeta a mano**: edita `docs/llm/GUIA.md` o
`docs/llm/ejemplos-reales.md` y regenera.
