import json
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from core.models import CatalogoTipo, Proveedor

CAMPOS = ("descripcion", "unidad_medida", "precio_base_unitario", "descuento_pct", "etapa_obra", "rendimiento_m2", "m2_por_unidad",
          "fuente_url", "verificado", "activo")


class Command(BaseCommand):
    help = ("Carga materiales al catálogo desde un JSON (lista de objetos con categoria, nombre, proveedor y precio). "
            "Es repetible: si el material ya existe (misma categoría, nombre y proveedor) se actualiza. "
            "Ejemplo: python manage.py cargar_materiales core/fixtures/materiales_ejemplo.json")

    def add_arguments(self, parser):
        parser.add_argument("archivo")

    def handle(self, *args, archivo, **opts):
        try:
            with open(archivo, encoding="utf-8") as f:
                filas = json.load(f)
        except (OSError, ValueError) as e:
            raise CommandError(f"No se pudo leer {archivo}: {e}")
        creados = actualizados = 0
        for n, fila in enumerate(filas, start=1):
            try:
                prov = self._proveedor(fila.get("proveedor"))
                valores = {k: fila[k] for k in CAMPOS if k in fila}
                if "precio_base_unitario" in valores:
                    valores["precio_base_unitario"] = Decimal(str(valores["precio_base_unitario"]))
                if "descuento_pct" in valores:
                    valores["descuento_pct"] = Decimal(str(valores["descuento_pct"]))
                valores.setdefault("unidad_medida", "UN")
                _, creado = CatalogoTipo.objects.update_or_create(
                    categoria=fila["categoria"].upper(), nombre=fila["nombre"], proveedor=prov, defaults=valores)
            except (KeyError, ValueError, AttributeError) as e:
                raise CommandError(f"Fila {n}: dato faltante o inválido ({e!r}). No se cargó nada después de esta fila.")
            creados += creado
            actualizados += not creado
        self.stdout.write(f"Materiales nuevos: {creados} · actualizados: {actualizados}")

    @staticmethod
    def _proveedor(ref):
        """Texto = razón social existente; objeto {rut_empresa, razon_social} = se crea si no existe."""
        if not ref:
            return None
        if isinstance(ref, dict):
            return Proveedor.objects.get_or_create(
                rut_empresa=ref["rut_empresa"],
                defaults={"razon_social": ref.get("razon_social", ref["rut_empresa"])})[0]
        prov = Proveedor.objects.filter(razon_social__iexact=ref).first()
        if not prov:
            raise ValueError(f"el proveedor «{ref}» no existe; créelo antes o use el formato con rut_empresa")
        return prov
