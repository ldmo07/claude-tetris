---
description: Crea un git worktree aislado en .trees/[nombre] y ejecuta ahí los requerimientos dados
argument-hint: <requerimiento a implementar en el worktree>
---

Requerimiento del usuario:

$ARGUMENTS

Sigue estos pasos:

1. **Determina el nombre** del worktree a partir del requerimiento: kebab-case, corto (2-4 palabras), sin tildes ni caracteres especiales, descriptivo (ej. `pieza-en-l-doble`, `modo-oscuro-persistente`). Si ya existe `.trees/<nombre>` o la rama `<nombre>`, añade un sufijo (`-2`).
2. **Verifica** que `.trees/` esté en `.gitignore`; si no, añádelo (sin commitearlo).
3. **Crea el worktree** desde la raíz del repo:
   `git worktree add .trees/<nombre>`
4. **Ejecuta el requerimiento dentro del worktree**, de forma independiente y aislada del código principal:
   - Delega el trabajo a un subagente (`Agent`, tipo `general-purpose`) cuyo prompt incluya el requerimiento completo, la ruta **absoluta** del worktree y la instrucción de leer/editar/ejecutar únicamente dentro de esa ruta (usar `git -C <ruta>` para git). Respeta el `CLAUDE.md` del proyecto.
   - No modifiques archivos del árbol principal.
   - Haz commits en la rama del worktree cuando el trabajo esté completo; no hagas merge ni push.
5. **Reporta** brevemente: nombre elegido, ruta del worktree, rama, resumen de lo hecho y cómo integrarlo (`git merge <nombre>`) o eliminarlo (`git worktree remove .trees/<nombre>`).

Si `$ARGUMENTS` está vacío, pide al usuario el requerimiento antes de crear nada.
