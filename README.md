# Guía de Instalación: Plataforma de Cotizaciones DenaServ

Este documento contiene el paso a paso para configurar el entorno de desarrollo local. **Sigan las instrucciones en orden para evitar errores.**

---

## 🛠 1. Tecnologías Requeridas (Software a descargar)

Antes de tocar el código, asegúrense de tener instalado lo siguiente en sus computadoras:

1. **Python (v3.11 o superior)**
   - Descargar desde: [python.org](https://www.python.org/downloads/)
   - > [!IMPORTANT]
     > Durante la instalación en Windows, es **OBLIGATORIO** marcar la casilla inferior que dice **"Add Python to PATH"** antes de darle a Instalar.
2. **Node.js (v20 o superior)**
   - Descargar desde: [nodejs.org](https://nodejs.org/) (Recomendado bajar la versión LTS).
3. **Git**
   - Descargar desde: [git-scm.com](https://git-scm.com/downloads)
4. **Editor de Código (Recomendado: Visual Studio Code)**
   - Descargar desde: [code.visualstudio.com](https://code.visualstudio.com/)

---

## 🧩 2. Extensiones Recomendadas para VS Code
Para que todos tengan el mismo formato y ayuda en el código, instalen estas extensiones en VS Code:
- **Python** (de Microsoft)
- **ESLint** (de Microsoft)
- **Tailwind CSS IntelliSense** (de Tailwind Labs)
- **Prettier - Code formatter** (Opcional, pero recomendado)

---

## 🚀 3. Paso a Paso: Configuración del Proyecto

Abran una terminal (PowerShell o Git Bash) y ejecuten los siguientes comandos paso a paso.

### Paso 3.1: Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/tu-repo.git
cd tu-repo
```
*(Cambien la URL por la URL real del repositorio en GitHub).*

### Paso 3.2: Configurar el Backend (Django)
Abran una terminal dentro de la carpeta del proyecto y ejecuten:

```powershell
# 1. Entrar a la carpeta del backend
cd backend

# 2. Crear el entorno virtual (solo se hace la primera vez)
python -m venv venv

# 3. Activar el entorno virtual
# Nota: Si sale un error rojo de permisos, correr primero: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
.\venv\Scripts\Activate.ps1

# 4. Instalar las dependencias de Python
pip install -r requirements.txt

# 5. Crear el archivo de credenciales (.env)
# IMPORTANTE: Pidan este archivo al administrador del proyecto, no se sube a GitHub por seguridad. 
# Debe colocarse dentro de la carpeta "backend" y llamarse exactamente ".env"

# 6. Aplicar las migraciones a la base de datos (Supabase)
python manage.py migrate

# 7. Iniciar el servidor local (Dejar esta terminal abierta)
python manage.py runserver 8000
```

### Paso 3.3: Configurar el Frontend (Next.js)
Abran una **segunda terminal** (nueva pestaña) dentro de la carpeta principal del proyecto y ejecuten:

```powershell
# 1. Entrar a la carpeta del frontend
cd frontend

# 2. Instalar los paquetes de Node.js
npm install

# 3. Iniciar el servidor del frontend (Dejar esta terminal abierta)
npm run dev
```

---

## ✅ 4. Comprobación Final

Si hicieron todo correctamente, deben tener **dos terminales corriendo al mismo tiempo** (una para Django y otra para Next.js).

1. El Backend estará disponible en: `http://127.0.0.1:8000/api/`
2. El Frontend (y donde deben entrar a probar la app) estará disponible en: `http://localhost:3000/`

Para iniciar sesión localmente en el frontend, pídanle al administrador que les cree un usuario o utilicen el superusuario temporal si existe.
