# Manual de usuario

DenaServ tiene un sitio público (portafolio, catálogo y contacto) y un **panel interno** al que se entra con una cuenta de Google
previamente autorizada, desde «Acceso de la empresa» al pie de la portada. Hay dos roles.

| | Admin | Operador |
|---|---|---|
| Cotizar, ver proyectos, registrar pagos, avances y bitácora | Sí | Sí |
| Ver el catálogo de materiales y sincronizar precios | Sí | Sí |
| Crear, editar o eliminar materiales | Sí | No |
| Ver proveedores | Sí | Sí |
| Crear, editar o eliminar proveedores | Sí | No |
| Portafolio y catálogo de casas | Crear, editar, eliminar, ocultar | Solo ocultar o publicar |
| Tarifas | Sí | Sí |
| Usuarios (autorizar, cambiar rol, eliminar) | Sí | No |
| Auditoría (quién cambió qué) | Sí | No |
| Reportes operativo y por período | Sí | Sí |
| Reporte gerencial (ganancias) | Sí | No |
| Documentación de la API | Sí | No |

El rol aparece bajo su nombre en la barra lateral. Si una acción no está permitida, el sistema responde con un aviso claro.

---

## Para el Operador

### Crear una cotización
1. **Proyectos → + Nuevo proyecto** (o **Panel principal → + Nuevo proyecto**).
2. Complete los datos del cliente (nombre, RUN, teléfono) y del terreno (dirección, superficie, distancia). Los errores se indican bajo cada campo.
3. Arme la lista de materiales con los filtros por categoría y ajuste la mano de obra y el traslado. El valor se calcula en vivo.
4. Si necesita otra tarifa solo para este proyecto, use **Tarifas de esta cotización**.
5. Guarde. El proyecto queda en estado **Cotizado**.

### Registrar pagos y avance
- En el proyecto, **Cronograma de pagos**: cada hito (anticipo 40 %, avance 30 %, entrega 30 %) admite abonos parciales con método, fecha y comprobante (imagen o PDF).
- El estado cambia solo: **En ejecución** cuando el anticipo está pagado por completo, **Obra terminada** cuando todos los pagos están completos.
- Para corregir un abono, use **Anular**; si respalda un avance ya registrado, el sistema pide confirmar y baja el avance. Un comprobante equivocado se cambia con **Reemplazar comprobante**.
- **Bitácora de avance:** registre el porcentaje, un comentario y fotos. El avance debe ser coherente con lo pagado (50 % exige el segundo pago).

### Consultar materiales y precios
**Materiales y precios** muestra precio de lista, descuento y costo neto. **Sincronizar precios ahora** vuelve a leer las tiendas.

### Reportes
**Reportes** → elija el tipo, los filtros y use **Descargar Excel / PDF / CSV** o **Imprimir**. Cada descarga queda registrada con su nombre.
El CSV usa «;» como separador y UTF-8.

### Portafolio
Puede ocultar o publicar las obras y las casas del catálogo desde **Portafolio**.

---

## Para el Admin

Además de todo lo anterior:

- **Usuarios:** autorice correos de Google (nombre, RUN, correo y rol). No puede quitarse su propio rol de Admin ni desactivar su acceso.
- **Proveedores y materiales:** alta, edición y baja. Un material con ficha de tienda toma su precio de ella; el descuento propio se escribe a mano.
- **Portafolio:** agregue obras terminadas (hasta 10 fotos) y casas del catálogo; edite, ocúltelas o elimínelas.
- **Auditoría:** historial de cambios y exportaciones, con filtros por entidad y acción.
- **Reporte gerencial:** ganancia por trimestre y estado.
- **Documentación de la API:** enlace en el menú.

---

## Dashboard
El **Panel principal** muestra los proyectos por estado (cada tarjeta lleva a la lista filtrada), el avance de las obras en ejecución, los gráficos por trimestre y el
**Análisis del negocio**: indicadores con su fórmula («Cómo se calcula»), gráficos con filtros de fecha y estado, y bajo cada gráfico una tabla con sus datos.

## Atajos de accesibilidad
- **Saltar al contenido:** primera tecla Tab de cada página.
- Los menús, ventanas y formularios se manejan con teclado; las ventanas se cierran con **Esc**.
