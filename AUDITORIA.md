# Auditoría de DENASERV WEB

Referencia: informe «Análisis y modelado de solución web DENASERV», más el modo de trabajo de la empresa informado después.
Estado revisado: 45 commits, 32 tests de backend, ningún test de frontend.

Leyenda: ✅ cumplido · 🟡 parcial · ❌ falta · 🔁 cambiado a propósito respecto del informe.

---

## 1. Cumplimiento de requerimientos funcionales (RFS)

| RFS | Requerimiento | Estado | Observación |
|---|---|---|---|
| 1 | Autenticación Google SSO | ✅ | Verifica firma del token y solo deja entrar correos registrados. |
| 2 | Cierre de sesión seguro | 🟡 | Solo borra el token del navegador; el token sigue siendo válido 7 días. |
| 3 | Cálculo de tabiquería | 🟡 | La función existe, pero no se muestra ni se guarda. Usa supuestos, no la guía CORMA. |
| 4 | Revestimiento | ✅ | Precios reales por m²; el valor sube solo por la diferencia con el más económico. |
| 5 | Base constructiva | 🟡 | Se elige, pero malla y polietileno no se cuantifican (rendimientos en 0). |
| 6 | Estabilizado | 🔁 | Se cubica en la visita al terreno y se suma o no al valor. Calza con tu operación. |
| 7 | Flete | 🔁 | Se usan las tarifas reales ($5.000 y $10.000 por m² según tramo), no la fórmula del informe. |
| 8 | Lista de materiales por etapa | ❌ en la práctica | El código existe, pero los 14 insumos tienen rendimiento 0 y no generan nada. |
| 9 | Cálculo financiero | 🔁 | Ganancia fija por m², IVA incluido en los $195.000 por m². |
| 10 | Cronograma 40-30-30 | ✅ | Con destino de cada pago. |
| 11 | Seguimiento de pagos | 🟡 | Se marca recibido o pendiente. Falta «atrasado» y registrar el n.º de comprobante en pantalla. |
| 12 | Proveedores (CRUD) | ✅ | Con descuento comercial. |
| 13 | Costo neto con descuento | ✅ | Los proveedores automáticos tienen descuento 0 hasta que lo cargues. |
| 14 | Avance y gasto real | ✅ | Con reporte de ganancia estimada y real. |
| 15 | Ficha PDF | ✅ | Folio, vigencia, versión cliente y versión empresa. |
| 16 | Portafolio | 🟡 | Se muestra, pero no hay pantalla para cargar obras ni subir fotos. |
| 17 | WhatsApp | ✅ | Falta poner el número real de la empresa. |

Requerimientos no funcionales relevantes:

| RNF | Estado | Observación |
|---|---|---|
| Cookies HttpOnly/Secure/SameSite | ❌ | El token está en `localStorage`. |
| 360 px de ancho | 🟡 | El menú sirve; las tablas se desbordan. |
| ACID | ✅ | Creación, nivelación y reajuste usan transacciones. |
| Disponibilidad 99 % | 🟡 | La capa gratuita de Render «duerme» el servicio; la primera visita puede tardar casi un minuto. |
| Costo $0 | 🟡 | El scraping con Apify consume créditos (ya no es necesario, ver más abajo). |
| Ley 19.628 | 🟡 | La ficha pública se abre con el folio, que es adivinable. |
| Repositorio con ramas y PR | ❌ | Todo está en `master`. |

---

## 2. Qué integrar (ordenado por prioridad)

### Prioridad alta: sin esto no se puede poner en producción

1. **Preparar el despliegue.** Hoy no se puede publicar tal como está:
   - El proxy de Next apunta fijo a `http://127.0.0.1:8000` ([route.ts](frontend/src/app/api/[...path]/route.ts)). En Vercel hay que leer la URL del backend desde una variable de entorno.
   - Falta `gunicorn` en `requirements.txt` y un comando de arranque; también falta servir estáticos y exigir `sslmode=require` a la base de datos.
   - Hay que documentar las variables (`DJANGO_SECRET_KEY`, `GOOGLE_CLIENT_ID`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `WHATSAPP_NUMERO`, `DB_*`) y agregar la URL de Vercel a los orígenes de Google.
2. **Enlace público no adivinable.** Hoy la ficha del cliente se abre con el folio (por ejemplo `COT-202611-97FD42CB30`) y muestra nombre, teléfono y dirección. El informe ya hablaba de un UUID: agregar un `token_publico` aleatorio en la URL.
3. **Sesión en cookie HttpOnly.** Es el único requerimiento de seguridad del informe que sigue sin cumplirse. Implica cambiar el login, el proxy de Next y las llamadas del panel.
4. **Actualización semanal de precios sin pagar.** Los Cron Jobs de Render no están, según mi conocimiento, en la capa gratuita (conviene verificarlo). Alternativa gratuita: una acción programada de GitHub que corra `python manage.py actualizar_precios` cada lunes. La sincronización en segundo plano dentro del servicio web no es confiable si Render lo duerme.

### Prioridad media: para que el sistema entregue lo que promete

5. **Rendimientos por m² de los insumos** (RFS-8). Es la brecha funcional más importante: sin ellos no hay lista de compras por etapa ni comparación contra lo gastado. Propuesta: una tabla única «casa estándar» que el jefe de obra completa una vez (pino 2x3, clavos, planchas, etc.), en vez de editar 14 fichas sueltas.
6. **Pantalla para administrar el portafolio** (RFS-16): título, comuna, m², revestimiento, plazo en días y fotos. Fotos en Supabase Storage (falta la clave `service_role`).
7. **Proteger precios editados a mano.** Hoy la actualización semanal pisa cualquier precio que edites en un ítem con fuente automática. Agregar un candado «precio fijo».
8. **Búsqueda y paginación en «Mis cotizaciones».** Con unas decenas de cotizaciones la lista ya se vuelve incómoda. Buscar por cliente o dirección y filtrar por estado.
9. **Campos que el informe pide y faltan:** correo y comuna del cliente, tipo de cubierta (zinc ondulado o 5V) y separación de pies derechos (40 o 60 cm).

### Prioridad baja

10. **Pagos «atrasados»** (RFS-11). Tus pagos dependen del avance, no de fechas fijas, así que «atrasado» tiene poco sentido tal cual. Propuesta: avisar cuando el avance llegó al 50 % y el segundo pago sigue pendiente.
11. **Pruebas del frontend y revisión automática** (GitHub Actions con tests y `tsc` en cada cambio).
12. **Respaldo de la base.** La capa gratuita de Supabase no garantiza restauración a un punto en el tiempo; programar una exportación periódica.

---

## 3. Qué cambiar

| Qué | Por qué | Cambio propuesto |
|---|---|---|
| Selección del insumo «más barato» | Produce elecciones dudosas (clavo de $190 por 10 unidades, malla de 0,9 m). | Marcar los automáticos como «sugeridos» y exigir revisión; o buscar por SKU o URL fija que tú elijas, sin elegir por precio. |
| Ganancia estimada | Con materiales de referencia ($135.000 por m²), la ganancia estimada siempre da $30.000 por m². No informa nada. | Cuando existan rendimientos, calcularla con el costo real de lista de compras; mientras tanto mostrarla como «meta». |
| Cotizaciones antiguas | Las 4 primeras se calcularon con fórmulas distintas y cualquier cambio de precio las recalcula. | Marcarlas como «versión anterior» o recalcularlas una sola vez de forma controlada. |
| Mensajes con `alert()` | Es desconcertante para usuarios mayores. | Reemplazar por avisos dentro de la página. |
| Tablas del panel | Se desbordan en pantallas chicas. | Pasar a tarjetas en móvil (visita al terreno desde el celular). |

---

## 4. Qué eliminar o simplificar

- **Apify.** Ya no se usa: el scraping directo de Sodimac, Easy y MCT lo reemplazó. Se puede quitar el código de `ejecutar_actor`, la variable `APIFY_TOKEN` y el prefijo `apify:`. Menos costo y menos dependencias.
- **Scripts peligrosos del repositorio:** `wipe_db.py`, `apply_schema.py` y `create_su.py`. Borran o recrean datos; no deben vivir junto al código de producción.
- **`/dashboard/inventario`** (solo redirige) y los endpoints sin uso: `POST /cotizaciones/{id}/insumos/` y `GET /cotizaciones/{id}/hitos/`.
- **La función `tabiqueria()`** si no la vas a mostrar: hoy calcula piezas que nadie ve. Mostrarla o quitarla.
- **Categoría `ESTABILIZADO`** y los campos relacionados (`estabilizado_id`) que quedaron en esquemas.
- **Datos de prueba:** los 3 revestimientos desactivados, el usuario con RUT `PENDIENTE-3` y las cotizaciones de demostración.

---

## 5. Factibilidad

**Técnica: alta, con riesgos conocidos.**
- El stack (Django Ninja, Next.js, PostgreSQL) está probado y sin costo de licencias.
- El riesgo mayor es el **scraping**: los sitios cambian su HTML y pueden bloquear. Mitigación: tratar el precio de tienda como **referencia**, no como verdad; el precio de convenio real es el que cargue el jefe (Excel o manual). MCT además tiene un certificado propio que vence el 14-nov-2026.
- Capa gratuita de Render: arranque lento y recursos limitados (512 MB). Aceptable para uso interno; incómodo para clientes que abren el enlace. Alternativa de bajo costo: instancia de pago más barata solo para el backend.

**Operacional: media-alta.**
- Tu proceso real (precio por m² → visita al terreno → contrato fuera del sistema → 40/30/30) ya está reflejado. Lo que más ayuda a la adopción es la simplicidad: el cotizador y la edición ya están guiados.
- Riesgo: depender de que el jefe cargue datos (rendimientos, descuentos, fotos). Conviene una jornada de carga inicial acompañada.
- Para usuarios mayores: probar con una persona real de la empresa antes de entregar y ajustar lo que le cueste.

**Económica: favorable.**
- Costo de licencias $0. Único gasto posible: plan pago de Render si la espera inicial molesta, y los créditos de Apify si se mantuviera.

---

## 6. Orden de trabajo sugerido

1. Despliegue (proxy, gunicorn, variables) y enlace público con token.
2. Cookie de sesión HttpOnly.
3. Rendimientos de insumos y lista de compras por etapa.
4. Administración de portafolio con fotos.
5. Programar la actualización semanal (GitHub Actions) y candado de precios manuales.
6. Búsqueda y paginación de cotizaciones; campos faltantes del cliente.
7. Limpieza (Apify, scripts, endpoints sin uso) y pruebas automáticas.
