# La Chuspa — Concierge Multinegocio Cusco

Plataforma multinegocio separada en **dos proyectos independientes**:

- **`backend/`**: Servidor Node.js + Express + SQLite + Gemini IA + sincronización en tiempo real con Firebase Realtime Database (`https://spatech-b3edf-default-rtdb.firebaseio.com/`).
- **`frontend/`**: Aplicación React + Vite + Tailwind CSS lista para desplegarse como bundle estático en GitHub Pages.

---

## 1. Ejecución en local

### Backend (`http://localhost:3000`)

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

En modo desarrollo, si `JWT_SECRET`, `SUPERADMIN_PIN` o `WHATSAPP_VERIFY_TOKEN` no están definidos en `.env`, el backend mostrará una advertencia clara en consola y continuará con valores temporales de desarrollo. En producción (`NODE_ENV=production`), exige dichas variables configuradas.

### Frontend (`http://localhost:5173`)

```bash
cd frontend
cp .env.example .env
npm install --legacy-peer-deps
npm run dev
```

Verifica que `frontend/.env` apunte al backend:

```env
VITE_API_URL=http://localhost:3000
VITE_FIREBASE_RTDB_URL=https://spatech-b3edf-default-rtdb.firebaseio.com
```

---

## 2. Despliegue en producción

### Backend en Render o Railway (Node.js >= 22)

1. Crea un nuevo **Web Service** conectando este repositorio y configura **Root Directory** en `backend`.
2. **Build Command**: `npm install`
3. **Start Command**: `npm start`
4. Configura estas variables de entorno:
   - `NODE_ENV=production`
   - `GEMINI_API_KEY=<tu-clave-gemini>`
   - `JWT_SECRET=<cadena-aleatoria-minimo-32-caracteres>`
   - `SUPERADMIN_PIN=<pin-superadmin>`
   - `WHATSAPP_VERIFY_TOKEN=<token-webhook-whatsapp>`
   - `FIREBASE_RTDB_URL=https://spatech-b3edf-default-rtdb.firebaseio.com`
   - `CORS_ORIGINS=https://phyxcius.github.io,http://localhost:5173`

### Frontend en GitHub Pages

1. En **Settings -> Pages**, selecciona **Source: GitHub Actions**.
2. (Opcional) En **Settings -> Secrets and variables -> Actions -> Variables**, crea `VITE_API_URL` con la URL pública de tu backend en Render/Railway (si no se define, GitHub Pages usará directamente tu base Firebase RTDB).
3. Al hacer `push` a la rama `main`, el workflow `.github/workflows/deploy.yml` compila `frontend/` y publica `frontend/dist/`.
