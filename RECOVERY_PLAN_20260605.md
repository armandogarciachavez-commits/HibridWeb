# 🔄 Plan de Recuperación — Sesión 2026-06-05

**Fecha de los cambios:** 2026-06-05
**Generado:** Sesión de auditoría completa
**Estado del repo al cerrar:** `b7795a6` (main) — working tree clean
**Estado del repo antes de iniciar:** `a0551a9` (math challenge en landing)

---

## 📋 Resumen de TODO lo cambiado hoy

### 🅰️ Commits realizados en GitHub (en orden cronológico)

| Hash | Mensaje | Tipo |
|------|---------|------|
| `e396871` | feat: server-side progress tracker (reps, distance, date) | Feature nueva |
| `e2a4b64` | build: update pwa-socios dist with progress tracker | Build |
| `94ff654` | feat: remove IMC calculator from socios profile | Feature removal |
| `0883279` | perf: exclude template_data from admin users eager load | Perf fix |
| `b7795a6` | chore: cleanup obsolete bootstrap scripts and update gitignore | Cleanup |

### 🅱️ Cambios en el VPS (fuera de git)

| # | Acción | Backup |
|---|--------|--------|
| A | Borrado `backend/public/opr.php` | `/tmp/opr.php.bak` |
| B | Borrado `backend/public/test_photo.php` | `/tmp/test_photo.php.bak` |
| C | Movido `backend/composer.phar` → `/home/alfahybridtranin/composer.phar` | En su nueva ubicación |
| D | `chmod 644 → 600` en `backend/.env` | `/tmp/env-permisos-antes.txt` |
| E | Movido `backend/seed_prod.php` → `/home/alfahybridtranin/scripts-archivo/seed_prod.php.archived-20260605` | Archivado |
| F | Movido `backend/create_test_user.php` → `/home/alfahybridtranin/scripts-archivo/create_test_user.php.archived-20260605` | Archivado |
| G | `git checkout backend/composer.lock` (revirtió bump psy/psysh 0.12.21→0.12.22) | No requerido — vuelve a origin |
| H | Borrados huérfanos `pwa-admin/dist/assets/index-BXlEfBuj.js` y `index-kR0EZgHP.js` | `/tmp/pwa-admin-orphans-20260605/` |
| I | Borrados 6 archivos basura en `backend/` (id, name, username, role, created_at, updated_at) | Sin backup (eran trash del tinker roto) |
| J | Ejecutada migración `progress_entries` (creó tabla nueva en DB) | Reversible con `php artisan migrate:rollback` |

---

## 🚨 NIVELES DE ROLLBACK

Hay **3 niveles** según qué tan agresivo quieras revertir:

### Nivel 1 — Rollback parcial (recomendado si solo algo específico falló)
Revertir solo el cambio sospechoso, dejando todo lo demás.

### Nivel 2 — Rollback de toda la auditoría de seguridad
Volver al estado justo antes de la auditoría de seguridad (después de la app de progreso y el IMC removal).
Commit objetivo: `94ff654`

### Nivel 3 — Rollback total al inicio de la sesión
Volver al estado de la mañana del 2026-06-05, antes de cualquier cambio de hoy.
Commit objetivo: `a0551a9` ⚠️ **Esto elimina el módulo de progreso COMPLETO**

---

## 🔧 NIVEL 1 — Rollback selectivo

### Caso 1A: Solo deshacer el fix de fingerprint en AdminController
```bash
# En el VPS
cp /home/alfahybridtranin/HibridWeb/backend/app/Http/Controllers/AdminController.php.backup-pre-fingerprint-fix \
   /home/alfahybridtranin/HibridWeb/backend/app/Http/Controllers/AdminController.php

# Verificar
curl -s -o /dev/null -w "API → HTTP %{http_code}\n" https://api.alfahybridtraning.com/api/classes
```

### Caso 1B: Restaurar opr.php y test_photo.php
```bash
# En el VPS
cp /tmp/opr.php.bak /home/alfahybridtranin/HibridWeb/backend/public/opr.php
cp /tmp/test_photo.php.bak /home/alfahybridtranin/HibridWeb/backend/public/test_photo.php
chown alfahybridtranin:alfahybridtranin /home/alfahybridtranin/HibridWeb/backend/public/opr.php
chown alfahybridtranin:alfahybridtranin /home/alfahybridtranin/HibridWeb/backend/public/test_photo.php

# Verificar
curl -s -o /dev/null -w "opr.php → HTTP %{http_code}\n" https://api.alfahybridtraning.com/opr.php
```

### Caso 1C: Mover composer.phar de vuelta al backend
```bash
mv /home/alfahybridtranin/composer.phar /home/alfahybridtranin/HibridWeb/backend/composer.phar
```

### Caso 1D: Revertir chmod 600 → 644 en .env
```bash
chmod 644 /home/alfahybridtranin/HibridWeb/backend/.env
ls -la /home/alfahybridtranin/HibridWeb/backend/.env
```

### Caso 1E: Restaurar seed_prod.php y create_test_user.php
```bash
mv /home/alfahybridtranin/scripts-archivo/seed_prod.php.archived-20260605 \
   /home/alfahybridtranin/HibridWeb/backend/seed_prod.php
mv /home/alfahybridtranin/scripts-archivo/create_test_user.php.archived-20260605 \
   /home/alfahybridtranin/HibridWeb/backend/create_test_user.php
```

### Caso 1F: Restaurar huérfanos JS del admin
```bash
cp /tmp/pwa-admin-orphans-20260605/index-BXlEfBuj.js /home/alfahybridtranin/HibridWeb/pwa-admin/dist/assets/
cp /tmp/pwa-admin-orphans-20260605/index-kR0EZgHP.js /home/alfahybridtranin/HibridWeb/pwa-admin/dist/assets/
```

### Caso 1G: Eliminar tabla `progress_entries` (⚠️ destructivo)
```bash
# Solo si quieres deshacer la migración de progress tracker
cd /home/alfahybridtranin/HibridWeb/backend && php artisan migrate:rollback --step=1
```
⚠️ **Esto borra TODA la data de progreso de socios.** Si algún socio ya guardó entradas, se pierden.

---

## 🔄 NIVEL 2 — Rollback de auditoría de seguridad completa

**Objetivo:** dejar la app exactamente como estaba justo después de remover el IMC (commit `94ff654`), conservando el progress tracker y la fix del fingerprint.

### Paso 2.1 — En la Mac
```bash
cd /Users/armandogarciachavez/Desktop/AlexEntrenador/HybridWeb

# Revertir commits b7795a6 y 0883279 (security audit + fingerprint fix)
git revert --no-edit b7795a6
git revert --no-edit 0883279
git push origin main
```

### Paso 2.2 — En el VPS
```bash
cd /home/alfahybridtranin/HibridWeb && git pull origin main

# Restaurar archivos del filesystem desde backups
cp /tmp/opr.php.bak /home/alfahybridtranin/HibridWeb/backend/public/opr.php
cp /tmp/test_photo.php.bak /home/alfahybridtranin/HibridWeb/backend/public/test_photo.php
chown alfahybridtranin:alfahybridtranin /home/alfahybridtranin/HibridWeb/backend/public/*.php

mv /home/alfahybridtranin/composer.phar /home/alfahybridtranin/HibridWeb/backend/composer.phar

chmod 644 /home/alfahybridtranin/HibridWeb/backend/.env

mv /home/alfahybridtranin/scripts-archivo/seed_prod.php.archived-20260605 \
   /home/alfahybridtranin/HibridWeb/backend/seed_prod.php
mv /home/alfahybridtranin/scripts-archivo/create_test_user.php.archived-20260605 \
   /home/alfahybridtranin/HibridWeb/backend/create_test_user.php

cp /tmp/pwa-admin-orphans-20260605/index-BXlEfBuj.js /home/alfahybridtranin/HibridWeb/pwa-admin/dist/assets/
cp /tmp/pwa-admin-orphans-20260605/index-kR0EZgHP.js /home/alfahybridtranin/HibridWeb/pwa-admin/dist/assets/
```

### Paso 2.3 — Verificar
```bash
curl -s -o /dev/null -w "Landing → HTTP %{http_code}\n" https://alfahybridtraning.com/
curl -s -o /dev/null -w "API     → HTTP %{http_code}\n" https://api.alfahybridtraning.com/api/classes
curl -s -o /dev/null -w "Admin   → HTTP %{http_code}\n" https://admin.alfahybridtraning.com/
curl -s -o /dev/null -w "Socios  → HTTP %{http_code}\n" https://socios.alfahybridtraning.com/
```

---

## 💥 NIVEL 3 — Rollback total al inicio del día

⚠️ **DESTRUCTIVO**. Esto:
- Elimina el módulo de progreso completo (frontend + backend + tabla DB)
- Restaura el IMC calculator en la app de socios
- Restaura el fingerprint eager-load lento
- Restaura todos los archivos huérfanos y vulnerables

Solo úsalo si algo se rompió gravemente y quieres volver al punto de partida del día.

### Paso 3.1 — En la Mac
```bash
cd /Users/armandogarciachavez/Desktop/AlexEntrenador/HybridWeb

# Revertir todos los commits del día en orden inverso
git revert --no-edit b7795a6  # cleanup
git revert --no-edit 0883279  # fingerprint fix
git revert --no-edit 94ff654  # IMC removal
git revert --no-edit e2a4b64  # pwa-socios build
git revert --no-edit e396871  # progress tracker

git push origin main
```

### Paso 3.2 — En el VPS
```bash
cd /home/alfahybridtranin/HibridWeb && git pull origin main

# Restaurar todo el filesystem (igual que Nivel 2)
cp /tmp/opr.php.bak /home/alfahybridtranin/HibridWeb/backend/public/opr.php
cp /tmp/test_photo.php.bak /home/alfahybridtranin/HibridWeb/backend/public/test_photo.php
chown alfahybridtranin:alfahybridtranin /home/alfahybridtranin/HibridWeb/backend/public/*.php

mv /home/alfahybridtranin/composer.phar /home/alfahybridtranin/HibridWeb/backend/composer.phar

chmod 644 /home/alfahybridtranin/HibridWeb/backend/.env

mv /home/alfahybridtranin/scripts-archivo/seed_prod.php.archived-20260605 \
   /home/alfahybridtranin/HibridWeb/backend/seed_prod.php
mv /home/alfahybridtranin/scripts-archivo/create_test_user.php.archived-20260605 \
   /home/alfahybridtranin/HibridWeb/backend/create_test_user.php

cp /tmp/pwa-admin-orphans-20260605/*.js /home/alfahybridtranin/HibridWeb/pwa-admin/dist/assets/

# ⚠️ Eliminar tabla progress_entries (PIERDE DATOS de socios que ya hayan registrado avance)
cd /home/alfahybridtranin/HibridWeb/backend && php artisan migrate:rollback --step=1
```

### Paso 3.3 — Verificar
```bash
curl -s -o /dev/null -w "Landing → HTTP %{http_code}\n" https://alfahybridtraning.com/
curl -s -o /dev/null -w "API     → HTTP %{http_code}\n" https://api.alfahybridtraning.com/api/classes
curl -s -o /dev/null -w "Admin   → HTTP %{http_code}\n" https://admin.alfahybridtraning.com/
curl -s -o /dev/null -w "Socios  → HTTP %{http_code}\n" https://socios.alfahybridtraning.com/
```

---

## 🤖 PROMPT para Claude (rollback asistido)

Si necesitas pasarle esto a Claude en una sesión futura, copia este prompt completo:

```
CONTEXTO: Necesito hacer rollback de cambios realizados el 2026-06-05 en el proyecto Alfa Hybrid Training (Laravel + React PWA).

REPO LOCAL: /Users/armandogarciachavez/Desktop/AlexEntrenador/HybridWeb
REPO REMOTO: github.com:armandogarciachavez-commits/HibridWeb.git
VPS: ssh root@srv783246.hstgr.cloud (cPanel)
RUTA EN VPS: /home/alfahybridtranin/HibridWeb

COMMITS A REVERTIR (en orden inverso de cronología):
- b7795a6 → chore: cleanup obsolete bootstrap scripts and update gitignore
- 0883279 → perf: exclude template_data from admin users eager load
- 94ff654 → feat: remove IMC calculator from socios profile (¿reincluirlo?)
- e2a4b64 → build: update pwa-socios dist with progress tracker
- e396871 → feat: server-side progress tracker (reps, distance, date)

ESTADO ANTERIOR (commit base seguro): a0551a9 (math challenge en landing — funcionando)

BACKUPS DISPONIBLES EN VPS:
- /tmp/opr.php.bak (script OPcache reset original)
- /tmp/test_photo.php.bak (script debug de foto)
- /tmp/env-permisos-antes.txt (snapshot de permisos .env antes de chmod 600)
- /tmp/pwa-admin-orphans-20260605/ (huérfanos JS del admin)
- /home/alfahybridtranin/composer.phar (era backend/composer.phar)
- /home/alfahybridtranin/scripts-archivo/seed_prod.php.archived-20260605
- /home/alfahybridtranin/scripts-archivo/create_test_user.php.archived-20260605
- /Users/armandogarciachavez/Desktop/AlexEntrenador/HybridWeb/backend/app/Http/Controllers/AdminController.php.backup-pre-fingerprint-fix (en Mac)

CAMBIOS EN BASE DE DATOS:
- Tabla `progress_entries` creada por migración 2026_05_14_000001 (revertir con `php artisan migrate:rollback --step=1`)
⚠️ Si revierto la migración, pierdo TODOS los registros de progreso que socios hayan creado.
⚠️ Verifica primero: `php artisan tinker --execute='echo App\\Models\\ProgressEntry::count();'`

NIVEL DE ROLLBACK QUE QUIERO (elegir):
- [ ] Nivel 1 — Selectivo (un solo punto específico)
- [ ] Nivel 2 — Toda la auditoría de seguridad (mantener progress tracker)
- [ ] Nivel 3 — TOTAL (perder progreso de socios + revertir todo)

INSTRUCCIONES:
1. Verifica primero el estado actual (git status, conteo de progress_entries, tests HTTP de los 4 sitios).
2. Confirma el nivel de rollback conmigo antes de ejecutar.
3. Si vas a hacer Nivel 3, alerta explícitamente sobre pérdida de datos de socios.
4. Ejecuta los pasos del nivel seleccionado en el orden documentado.
5. Verifica al final que los 4 sitios respondan HTTP 200.

ARCHIVO DE REFERENCIA COMPLETO:
/Users/armandogarciachavez/Desktop/AlexEntrenador/HybridWeb/RECOVERY_PLAN_20260605.md
```

---

## ✅ Checklist post-rollback (cualquier nivel)

Después de cualquier rollback, verifica:

- [ ] Landing responde HTTP 200: `https://alfahybridtraning.com/`
- [ ] API responde HTTP 200: `https://api.alfahybridtraning.com/api/classes`
- [ ] Admin responde HTTP 200: `https://admin.alfahybridtraning.com/`
- [ ] Socios responde HTTP 200: `https://socios.alfahybridtraning.com/`
- [ ] Login de admin funciona (ingresar a admin.alfahybridtraning.com)
- [ ] Login de socio funciona
- [ ] La lista de socios carga (sin "Error fetching")
- [ ] El calendario muestra clases
- [ ] La biométrica del gym sigue verificando huellas
- [ ] `git status` en VPS → working tree clean
- [ ] `git status` en Mac → working tree clean
- [ ] Ambos repos en mismo HEAD: `git log --oneline -1` da el mismo hash

---

## 📞 Si nada funciona — Recuperación de emergencia

Si todo se rompe y no puedes recuperarte con los pasos de arriba:

1. **Backup completo del repo en GitHub** — el historial de commits está intacto en GitHub. Puedes hacer `git clone` desde cero y empezar limpio.
2. **Tabla `progress_entries`** — si está corrupta, recreable con `php artisan migrate`.
3. **`.env`** — credenciales DB están en el `.env` del VPS. Si el .env se pierde, contactar al proveedor de hosting para recuperar las credenciales de DB del panel de cPanel.

---

**Documento generado en sesión de:** 2026-06-05
**Autor:** Claude Sonnet 4.6 (en asistencia a armandogarciachavez@gmail.com)
**Estado al cierre:** Working tree clean, todos los servicios HTTP 200, 173 socios accesibles
