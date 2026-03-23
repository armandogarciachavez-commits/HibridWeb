# 🚀 Despliegue de HybridWeb en cPanel (VPS)

Esta es la guía definitiva para alojar el proyecto *Alfa Hybrid Training* en un entorno cPanel con la máxima seguridad, separando las aplicaciones internas de la carpeta pública (`public_html`).

## 📁 Estructura del Repositorio

1.  **`landing-page/`**: El sitio web promocional de aterrizaje (HTML/CSS/JS).
2.  **`backend/`**: La API en Laravel 11.
3.  **`pwa-admin/`**: El Panel de Control en React Vite.
4.  **`pwa-socios/`**: La Aplicación Web para clientes en React Vite.

---

## 🛠️ Paso 1: Configurar Subdominios en cPanel

Por seguridad, nunca debes colocar el código de Laravel ni los fuentes de React directamente en `public_html`. Ve a tu cPanel -> "Subdominios" (o "Dominios" en cPanels modernos) y crea los siguientes 3 registros apuntando a nuevas carpetas de Document Root **fuera** de `public_html`:

1.  **`api.alfahybridtraning.com`**
    *   Directorio principal (Document Root): `/home/tu_usuario/hybrid-backend/public`
2.  **`admin.alfahybridtraning.com`**
    *   Directorio principal (Document Root): `/home/tu_usuario/hybrid-admin/dist`
3.  **`socios.alfahybridtraning.com`**
    *   Directorio principal (Document Root): `/home/tu_usuario/hybrid-socios/dist`

---

## 🌍 Paso 2: La Landing Page Principal

1. Sube el **contenido** de la carpeta `landing-page/` directamente a tu directorio `/home/tu_usuario/public_html/`.
2. Ahora al entrar a `https://alfahybridtraning.com` se verá tu sitio web con los videos e imágenes.
*(Nota: Asegúrate de actualizar los enlaces de los botones de la landing page para que apunten a `https://socios.alfahybridtraning.com` según corresponda).*

---

## ⚙️ Paso 3: Despliegue del Backend (Laravel)

1. Sube el **contenido** de la carpeta `backend/` a tu directorio `/home/tu_usuario/hybrid-backend/`.
2. En tu gestor de archivos cPanel, renombra `.env.example` a `.env`.
3. Crea una base de datos MySQL en cPanel (ej. `tu_usuario_hybrid`).
4. Edita el archivo `.env` recién creado y actualiza los credenciales:
   ```env
   APP_ENV=production
   APP_DEBUG=false
   APP_URL=https://api.alfahybridtraning.com

   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=tu_usuario_hybrid
   DB_USERNAME=tu_usuario_db
   DB_PASSWORD=tu_password_secreto
   ```
5. A través de la Terminal de cPanel o SSH, navega a la carpeta `/home/tu_usuario/hybrid-backend/` y ejecuta:
   ```bash
   composer install --no-dev --optimize-autoloader
   php artisan key:generate
   php artisan storage:link
   php artisan migrate --force
   php artisan optimize
   ```

---

## 📱 Paso 4: Despliegue de PWA Admin y Socios

Antes de subir las PWAs, es necesario compilarlas (esto lo harás desde tu computadora local usando Node.js, ya que GitHub y cPanel esperan solo el resultado final):

1. **Localmente en `pwa-admin/`**:
   *   Copia `.env.example` a `.env.local` y asegúrate de que diga: `VITE_API_URL=https://api.alfahybridtraning.com/api`
   *   Ejecuta: `npm run build`
   *   Sube el contenido de la carpeta `/pwa-admin/dist/` a tu cPanel en la ruta `/home/tu_usuario/hybrid-admin/dist/` (Esta ruta debe coincidir con el Document Root del subdominio de admin).
   
2. **Localmente en `pwa-socios/`**:
   *   Copia `.env.example` a `.env.local` y asegúrate de que diga: `VITE_API_URL=https://api.alfahybridtraning.com/api`
   *   Ejecuta: `npm run build`
   *   Sube el contenido de la carpeta `/pwa-socios/dist/` a tu cPanel en la ruta `/home/tu_usuario/hybrid-socios/dist/` (Establecida en el subdominio socios).

*(Importante: Si usas React Router, asegúrate de añadir un archivo `.htaccess` dentro de la carpeta `dist/` en tu servidor para evitar errores 404 al recargar la página).*

---
✅ **¡Listo!** Ahora tu ecosistema completo (Página alojada nativa, Backend asegurado por dominio independiente y dos paneles PWA funcionales) estará productivo de extremo a extremo.
