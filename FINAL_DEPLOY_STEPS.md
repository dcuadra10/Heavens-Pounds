# Pasos Finales para Deploy en Vercel

## 🎯 Estado Actual
✅ **Bot desplegado en Koyeb**: `https://overseas-mimi-heavens-295a972c.koyeb.app`  
✅ **Repositorios creados**:
- Bot: [https://github.com/dcuadra10/Heavens-Pounds](https://github.com/dcuadra10/Heavens-Pounds)
- Web: [https://github.com/dcuadra10/Heavens-Of-Glory](https://github.com/dcuadra10/Heavens-Of-Glory)

## 🚀 Deploy en Vercel

### 1. Conectar Repositorio a Vercel
1. Ve a [vercel.com](https://vercel.com)
2. Haz clic en "New Project"
3. Conecta tu repositorio: `dcuadra10/Heavens-Of-Glory`
4. Configura:
   - **Framework Preset**: `Other`
   - **Root Directory**: `/` (raíz)
   - **Build Command**: (dejar vacío)
   - **Output Directory**: `public`

### 2. Configurar Variables de Entorno
En Vercel, ve a **Settings** → **Environment Variables** y agrega:

| Name | Value | Environment |
|------|-------|-------------|
| `DISCORD_TOKEN` | `tu_token_del_bot` | Production, Preview, Development |
| `GUILD_ID` | `tu_server_id_de_discord` | Production, Preview, Development |
| `BOT_API_URL` | `https://overseas-mimi-heavens-295a972c.koyeb.app/api/guild-info` | Production, Preview, Development |

### 3. Deploy
1. Haz clic en "Deploy"
2. Espera a que termine el build
3. Tu página estará en: `https://heavens-of-glory.vercel.app`

## 🧪 Probar la Conexión

### 1. Prueba tu bot directamente:
```
https://overseas-mimi-heavens-295a972c.koyeb.app/api/guild-info
```

### 2. Prueba tu página web:
Una vez desplegada, deberías ver:
- Estadísticas en tiempo real
- Actualización cada 30 segundos
- Datos reales de tu servidor Discord

## 📋 Checklist Final

- [x] Bot desplegado en Koyeb
- [x] Repositorios creados en GitHub
- [ ] Página web conectada a Vercel
- [ ] Variables de entorno configuradas en Vercel
- [ ] Deploy completado
- [ ] Página web funcionando con estadísticas en tiempo real

## 🔧 Si algo no funciona

### Error en la página web:
1. Verifica que las variables de entorno estén configuradas
2. Revisa la consola del navegador (F12)
3. Asegúrate de que el bot esté online

### Error en el bot:
1. Revisa los logs en Koyeb
2. Verifica que las variables de entorno estén configuradas
3. Asegúrate de que el bot esté en el servidor Discord

## 🎉 ¡Casi listo!

Solo necesitas:
1. Conectar el repositorio a Vercel
2. Configurar las variables de entorno
3. Deploy

¡Tu página web mostrará estadísticas en tiempo real de tu servidor Discord!
