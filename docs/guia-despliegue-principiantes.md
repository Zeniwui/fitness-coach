# Guía de despliegue para principiantes (Coste $0/mes)

Esta guía explica cómo desplegar **Fitness Coach** manteniendo el coste en **$0/mes** (ADR-0003) y el acceso privado por invitación con **Supabase Auth** (correo electrónico y contraseña).

---

## 1. Configurar Supabase Auth (Acceso privado por invitación)

1. Crea un proyecto gratuito en [Supabase](https://supabase.com/).
2. En el panel de Supabase, ve a **Authentication → Providers → Email** y verifica:
   - **Enable Email provider**: activado.
   - **Allow new users to sign up** (registro público): **DESACTIVADO** (obligatorio para conservar acceso privado por invitación).
3. Ve a **Project Settings → API** (o **API Keys**) y anota dos valores públicos para la PWA:
   - **Project URL** → `VITE_SUPABASE_URL` (ejemplo: `https://tu-proyecto.supabase.co`).
   - **Project API key (`anon` / `public` / `publishable`)** → `VITE_SUPABASE_ANON_KEY`.

> **Nota de seguridad sobre `VITE_SUPABASE_ANON_KEY`:**
> Esta clave está diseñada por Supabase para ser pública en el navegador. Es segura en el bundle de la PWA siempre que el registro público esté deshabilitado en Supabase Auth y toda la lógica de autorización y aislamiento por Atleta se aplique en el backend FastAPI y en las políticas privadas de Storage. **Nunca** coloques `SUPABASE_SERVICE_ROLE_KEY` en el frontend.

---

## 2. Variables de entorno del frontend (PWA)

La PWA necesita estas variables públicas en tiempo de compilación:

| Variable | Obligatoria | Descripción |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Sí | URL base de tu proyecto Supabase (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Sí | Clave pública `anon` (o `publishable key`) de Supabase |
| `VITE_API_BASE_URL` | Sí (producción) | URL pública del backend FastAPI (por ejemplo en Render) |

> Si falta `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY`, la pantalla de inicio de sesión mostrará un aviso claro indicando exactamente qué variable falta en lugar de fallar en silencio.

### En Cloudflare Pages

1. Abre tu proyecto en **Cloudflare Pages → Settings → Environment variables**.
2. Añade `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_API_BASE_URL` en **Production** (y en **Preview** si usas despliegues previos).
3. Lanza un nuevo despliegue para que Vite inyecte las variables en el bundle estático.

### En Vercel

1. Abre tu proyecto en **Vercel → Settings → Environment Variables**.
2. Añade `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_API_BASE_URL`.
3. Ejecuta **Redeploy** para aplicar los cambios.

### En desarrollo local

Crea el archivo `frontend/.env.local` (ignorado por Git):

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-clave-publica-anon
VITE_API_BASE_URL=http://localhost:8000
```

---

## 3. Arranque inicial del primer Curador (sin `curl`)

Cuando despliegues Fitness Coach por primera vez con la base vacía:

1. En el backend (Render o entorno local), configura `BOOTSTRAP_CURATOR_EMAIL` con el correo electrónico del primer Curador (y opcionalmente `BOOTSTRAP_CURATOR_SUBJECT`).
2. En el panel de **Supabase → Authentication → Users → Add user → Create new user**, crea la identidad del Curador con su correo electrónico y contraseña (marca **Auto Confirm User** para que pueda entrar al instante).
3. Abre la PWA e inicia sesión con ese correo y contraseña.
4. Como todavía no existe ninguna cuenta de Atleta en Fitness Coach, la PWA te llevará automáticamente a la pantalla de **Activación de cuenta**.
5. Selecciona la pestaña **Activar Curador inicial**, introduce opcionalmente tu **Nombre de Atleta** y pulsa **Activar cuenta de Curador**.
6. Entrarás directamente con rol dual (**Curador + Atleta**), listo para gestionar la Base de Conocimiento y emitir invitaciones sin ejecutar comandos externos.

---

## 4. Dar de alta a un nuevo Atleta (correo, contraseña y enlace directo)

El alta de nuevos Atletas es siempre controlada por un Curador:

1. **Crear identidad en Supabase Auth**:
   - En **Supabase → Authentication → Users → Add user → Create new user**, introduce el correo electrónico del nuevo Atleta y una contraseña inicial (con **Auto Confirm User** activado).
2. **Emitir invitación en la PWA**:
   - Entra a la PWA con tu cuenta de Curador y abre **Ciencia → Panel del Curador — Invitaciones**.
   - Introduce el mismo correo electrónico del Atleta (y marca si también tendrá rol dual de Curador) y pulsa **Generar invitación**.
   - Verás tanto el **código de invitación** como el **enlace directo** (`https://tu-pwa/?invite=<código>`).
   - Pulsa **Copiar enlace** y compártelo de forma privada junto con las credenciales iniciales.
3. **Activación del Atleta en el móvil**:
   - El Atleta abre el enlace directo en su móvil e inicia sesión con su correo y contraseña (compatible con gestores de contraseñas y biometría del dispositivo).
   - La PWA conserva automáticamente el código de invitación, lo pre-rellena en la pantalla de activación y, tras pulsar **Activar cuenta con invitación**, limpia `?invite=` de la URL y abre su **Coach** y **Perfil Vivo**.
   - A partir de ese momento, la sesión persiste y el token se renueva automáticamente en segundo plano sin tener que volver a pegar tokens JWT manualmente.
