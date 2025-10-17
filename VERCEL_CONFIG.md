# Configuración para Vercel

## 🎯 Tu BOT_API_URL
```
https://overseas-mimi-heavens-295a972c.koyeb.app/api/guild-info
```

## 📋 Variables de Entorno para Vercel

Cuando despliegues en Vercel, configura estas variables:

### Variables de Entorno:
```
DISCORD_TOKEN=tu_token_del_bot
GUILD_ID=tu_server_id_de_discord
BOT_API_URL=https://overseas-mimi-heavens-295a972c.koyeb.app/api/guild-info
```

## 🚀 Pasos para Deploy en Vercel

### 1. Crear Repositorio para la Página Web
1. Crea un nuevo repositorio en GitHub: `heavens-of-glory-web`
2. Sube estos archivos:
   - `public/` (carpeta completa)
   - `server.js`
   - `vercel.json`
   - `package.json`

### 2. Conectar a Vercel
1. Ve a [vercel.com](https://vercel.com)
2. Crea nuevo proyecto
3. Conecta tu repositorio `heavens-of-glory-web`
4. Configura:
   - **Root Directory**: `/` (raíz)
   - **Build Command**: (dejar vacío)
   - **Output Directory**: `public`

### 3. Configurar Variables de Entorno
En Vercel, ve a Settings → Environment Variables y agrega:

| Name | Value |
|------|-------|
| `DISCORD_TOKEN` | `tu_token_del_bot` |
| `GUILD_ID` | `tu_server_id_de_discord` |
| `BOT_API_URL` | `https://overseas-mimi-heavens-295a972c.koyeb.app/api/guild-info` |

### 4. Deploy
1. Haz clic en "Deploy"
2. Espera a que termine
3. Tu página estará en: `https://tu-pagina.vercel.app`

## 🧪 Probar la Conexión

### 1. Prueba tu bot directamente:
Abre en el navegador:
```
https://overseas-mimi-heavens-295a972c.koyeb.app/api/guild-info
```

Deberías ver algo como:
```json
{
  "serverName": "Heavens of Glory",
  "status": "Online",
  "totalMembers": 250,
  "onlineMembers": 45,
  "notes": "Serving 250 members"
}
```

### 2. Prueba tu página web:
Una vez desplegada, deberías ver las estadísticas actualizándose cada 30 segundos.

## 📁 Archivos que Necesitas Subir

### Para el repositorio `heavens-of-glory-web`:
```
heavens-of-glory-web/
├── public/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│   └── IMG_4145.png
├── server.js
├── vercel.json
└── package.json
```

## 🔧 Configuración de package.json

Asegúrate de que tu `package.json` tenga:

```json
{
  "name": "heavens-of-glory-web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "echo 'No build step required'"
  },
  "dependencies": {
    "express": "^4.19.2",
    "discord.js": "^14.15.3",
    "dotenv": "16.3.1"
  }
}
```

## ✅ Checklist Final

- [ ] Bot desplegado en Koyeb ✅
- [ ] URL del bot obtenida ✅
- [ ] Repositorio de página web creado
- [ ] Archivos subidos al repositorio
- [ ] Vercel conectado al repositorio
- [ ] Variables de entorno configuradas
- [ ] Deploy completado
- [ ] Página web funcionando con estadísticas en tiempo real

¡Ya tienes la parte más difícil (el bot) lista! Ahora solo necesitas configurar la página web en Vercel.
