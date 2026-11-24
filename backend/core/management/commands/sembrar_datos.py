"""Datos de prueba sintéticos: cotizaciones con 12 meses de historia, sus hitos de pago, abonos y avance de obra.

Uso:   python manage.py sembrar_datos --base-de-pruebas [--cantidad 520] [--semilla 7]
Borra: python manage.py sembrar_datos --base-de-pruebas --limpiar

Todo lo que crea es inventado (nombres, RUN, teléfonos y direcciones no corresponden a personas reales) y queda marcado:
las cotizaciones llevan el código «SIM-…» y pertenecen al usuario sintetico@denaserv.test, de modo que `--limpiar` las quita sin
tocar los datos reales. Como el .env local puede apuntar a producción, el comando exige el indicador --base-de-pruebas."""
import random
from datetime import date, datetime, time, timedelta
from decimal import Decimal as D

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core import calculo, dominio
from core.models import Cotizacion, DetalleRegistro, HitoPago, ObraEjecucion, Usuario
from core.validadores import dv_correcto

USUARIO_EMAIL = "sintetico@denaserv.test"
NOMBRES = ["Camila", "Matías", "Valentina", "Sebastián", "Francisca", "Benjamín", "Javiera", "Nicolás", "Constanza", "Felipe", "Daniela", "Cristóbal",
           "Antonia", "Joaquín", "Fernanda", "Tomás", "Catalina", "Vicente", "Isidora", "Agustín"]
APELLIDOS = ["González", "Muñoz", "Rojas", "Díaz", "Pérez", "Soto", "Contreras", "Silva", "Martínez", "Sepúlveda", "Morales", "Rodríguez",
             "López", "Fuentes", "Hernández", "Torres", "Araya", "Flores", "Espinoza", "Valenzuela"]
CALLES = ["Los Aromos", "Las Araucarias", "El Roble", "Los Copihues", "Villa Alegre", "Los Notros", "San Martín", "Las Rosas", "Parcela", "Camino a Antuco"]
COMUNAS = ["Los Ángeles", "Mulchén", "Nacimiento", "Cabrero", "Santa Bárbara", "Laja", "Yumbel", "Quilleco"]
METODOS = ["TRANSFERENCIA", "TRANSFERENCIA", "TRANSFERENCIA", "EFECTIVO", "CHEQUE", "DEBITO"]


def run_falso(rng):
    """RUN con dígito verificador correcto, en un rango de números altos que no se asigna a personas (no son datos reales)."""
    cuerpo = rng.randint(60_000_000, 69_999_999)
    return f"{cuerpo}-{dv_correcto(str(cuerpo))}"


class Command(BaseCommand):
    help = "Crea (o con --limpiar, borra) datos de prueba sintéticos con 12 meses de historia."

    def add_arguments(self, parser):
        parser.add_argument("--base-de-pruebas", action="store_true", help="Confirma que la base configurada es de pruebas, no la de producción.")
        parser.add_argument("--cantidad", type=int, default=520)
        parser.add_argument("--semilla", type=int, default=7, help="Mismo valor, mismos datos.")
        parser.add_argument("--limpiar", action="store_true", help="Borra los datos sintéticos en lugar de crearlos.")

    def handle(self, *args, cantidad, semilla, limpiar, **opts):
        if not opts["base_de_pruebas"]:
            raise CommandError("Indique --base-de-pruebas para confirmar que la base configurada NO es la de producción.")
        if limpiar:
            n, _ = Cotizacion.objects.filter(codigo_cotizacion__startswith="SIM-").delete()
            Usuario.objects.filter(email=USUARIO_EMAIL).delete()
            return self.stdout.write(self.style.SUCCESS(f"Datos sintéticos eliminados ({n} registros)."))
        if Cotizacion.objects.filter(codigo_cotizacion__startswith="SIM-").exists():
            raise CommandError("Ya hay datos sintéticos. Use --limpiar antes de volver a sembrar.")
        self._sembrar(cantidad, random.Random(semilla))

    def _sembrar(self, cantidad, rng):
        hoy = timezone.localdate()
        usuario, _ = Usuario.objects.get_or_create(email=USUARIO_EMAIL, defaults={"rut": "11111111-1", "nombre_completo": "Usuario sintético", "rol": "OPERADOR"})
        cotizaciones, plan = [], []
        for n in range(1, cantidad + 1):
            dias = int(rng.triangular(0, 365, 300))                             # hay más proyectos antiguos que recientes
            creada = timezone.make_aware(datetime.combine(hoy - timedelta(days=dias), time(rng.randint(9, 18), rng.randint(0, 59))))
            radier = rng.random() < 0.15
            m2 = D(rng.randint(15, 60) if radier else rng.randint(36, 140))
            materiales = (m2 * D(rng.randint(85_000, 140_000) if not radier else rng.randint(18_000, 26_000))).quantize(D(1))
            mano_obra = (m2 * D(rng.choice([25_000, 25_000, 28_000]) if not radier else 12_000)).quantize(D(1))
            flete = D(rng.randint(40, 320) * 1000)
            ganancia = (m2 * D(rng.choice([25_000, 30_000, 30_000, 35_000]) if not radier else 9_000)).quantize(D(1))
            total = materiales + mano_obra + flete + ganancia
            cotizaciones.append(Cotizacion(
                codigo_cotizacion=f"SIM-{creada:%Y%m}-{n:04d}", cliente_nombre=f"{rng.choice(NOMBRES)} {rng.choice(APELLIDOS)} {rng.choice(APELLIDOS)}",
                cliente_telefono=f"+569{rng.randint(10_000_000, 99_999_999)}", cliente_rut=run_falso(rng),
                direccion_terreno=f"{rng.choice(CALLES)} {rng.randint(10, 999)}, {rng.choice(COMUNAS)}", superficie_m2=m2,
                distancia_flete_km=D(rng.randint(2, 90)), costo_materiales=materiales, costo_mano_obra=mano_obra, costo_flete=flete, costo_total=total,
                tipo_proyecto="SOLO_RADIER" if radier else "CASA", ganancia_m2=ganancia / m2, fecha_creacion=creada, usuario=usuario))
            plan.append((dias, total))
        Cotizacion.objects.bulk_create(cotizaciones, batch_size=200)           # no pasa por las señales: no llena la auditoría

        hitos, registros, obras = [], [], []
        for cot, (dias, total) in zip(cotizaciones, plan):
            avance_pagos = min(1.0, dias / 240) * rng.uniform(0.55, 1.15)      # cuánto del proyecto ya se cobró según su antigüedad
            for fase, pct, monto in calculo.hitos(total):
                inicio = cot.fecha_creacion.date()
                fecha = inicio + timedelta(days=int({"ANTICIPO_40": 6, "AVANCE_30": 60, "ENTREGA_30": 110}[fase] * rng.uniform(0.7, 1.4)))
                umbral = {"ANTICIPO_40": 0.12, "AVANCE_30": 0.45, "ENTREGA_30": 0.85}[fase]
                if avance_pagos >= umbral and fecha <= hoy:
                    abonado, estado = monto, "PAGADO"
                elif fase != "ENTREGA_30" and avance_pagos >= umbral * 0.8 and fecha <= hoy and rng.random() < 0.3:
                    abonado, estado = (monto * D("0.5")).quantize(D(1)), "ABONADO"
                else:
                    abonado, estado = D(0), "PENDIENTE"
                hitos.append(HitoPago(cotizacion=cot, fase=fase, porcentaje=pct, monto_pago=monto, estado=estado, monto_abonado=abonado,
                                      fecha_pago=fecha if abonado else None))
                if abonado:
                    registros.append((len(hitos) - 1, abonado, fecha))
        HitoPago.objects.bulk_create(hitos, batch_size=500)

        libro = [DetalleRegistro(hito=hitos[i], monto=m, metodo=rng.choice(METODOS), fecha=f, usuario=usuario) for i, m, f in registros]
        DetalleRegistro.objects.bulk_create(libro, batch_size=500)

        por_cot = {}
        for h in hitos:
            por_cot.setdefault(h.cotizacion.codigo_cotizacion, []).append(h)
        for cot in cotizaciones:
            hs = por_cot[cot.codigo_cotizacion]
            estado = dominio.estado_segun_pagos(hs)
            cot.estado = estado
            if estado != "BORRADOR":
                minimo, maximo = dominio.limites_avance(hs)
                avance = D(100) if estado == "FINALIZADA" else D(rng.randint(int(minimo), int(maximo)))
                obras.append(ObraEjecucion(cotizacion=cot, porcentaje_avance_real=avance, fecha_ultima_actualizacion=hoy))
        Cotizacion.objects.bulk_update(cotizaciones, ["estado"], batch_size=500)
        ObraEjecucion.objects.bulk_create(obras, batch_size=500)
        self.stdout.write(self.style.SUCCESS(
            f"Se crearon {len(cotizaciones)} cotizaciones sintéticas, {len(hitos)} hitos, {len(libro)} abonos y {len(obras)} obras."))
