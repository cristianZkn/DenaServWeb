# Documentación del repositorio

| Archivo | Contenido |
|---|---|
| [openapi.json](openapi.json) | Contrato OpenAPI 3 de la API (rutas, verbos, esquemas, códigos de estado y esquema de seguridad `Bearer`). |
| [manual-de-usuario.md](manual-de-usuario.md) | Manual breve de uso por rol (Admin y Operador). |

El contrato se genera desde el código; si cambia la API, se regenera con:

```powershell
cd backend
python manage.py exportar_openapi
```

La documentación interactiva (Swagger) está en `/api/docs` y solo la abre un Admin con sesión iniciada.

La arquitectura, el modelo de datos, los requerimientos y el plan de despliegue están en el informe técnico (Drive); el despliegue real
también se describe en [DEPLOY.md](../DEPLOY.md).
