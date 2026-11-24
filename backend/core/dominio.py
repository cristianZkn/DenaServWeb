"""Reglas de negocio puras de pagos y avance de obra: no usan la base de datos ni Django, solo valores y objetos con los
atributos indicados (por eso se prueban sin base de datos, ver DominioPagosTests).

Un «hito» tiene: fase, estado, porcentaje, monto_pago y monto_abonado."""
from decimal import Decimal

ETIQUETA_ESTADO = {"BORRADOR": "Cotizado", "ACEPTADA": "En ejecución", "FINALIZADA": "Obra terminada"}


def pesos(n) -> str:
    """12345 -> '$12.345'"""
    return "$" + f"{int(n):,}".replace(",", ".")


def anticipo_pagado(hitos) -> bool:
    """True si el primer pago (anticipo del 40 %) está pagado por completo."""
    return any(h.fase == "ANTICIPO_40" and h.estado == "PAGADO" for h in hitos)


def estado_segun_pagos(hitos) -> str:
    """Cotizado hasta pagar POR COMPLETO el anticipo del 40 % (un pago con saldo pendiente no cambia el estado); En
    ejecución desde entonces; Obra terminada al completarse TODOS los pagos."""
    if hitos and all(h.estado == "PAGADO" for h in hitos):
        return "FINALIZADA"
    return "ACEPTADA" if anticipo_pagado(hitos) else "BORRADOR"


def limites_avance(hitos) -> tuple:
    """(mínimo, máximo) de avance permitido según lo pagado. El 2.º pago corresponde al 50 % de avance y el último al
    100 %: sin el anticipo completo no hay avance; con solo el anticipo el avance llega hasta 49 %; hasta cobrar el último pago, 99 %."""
    pagado = {h.fase for h in hitos if h.estado == "PAGADO"}
    todos = bool(hitos) and all(h.estado == "PAGADO" for h in hitos)
    maximo = 100 if todos else 99 if "AVANCE_30" in pagado else 49 if "ANTICIPO_40" in pagado else 0
    minimo = 100 if todos else 50 if "AVANCE_30" in pagado else 0
    return min(minimo, maximo), maximo


def mensaje_tope_avance(maximo) -> str:
    if maximo == 0:
        return "El anticipo (40 %) aún no está pagado por completo: la obra no ha iniciado. Complete ese pago para comenzar."
    if maximo == 49:
        return "El avance no puede llegar al 50 % mientras el 2.º pago no esté cobrado completo."
    return "El 100 % de avance se registra al cobrar por completo el último pago."


def error_de_avance(hitos, avance, actual=None):
    """None si el avance es coherente con los pagos; si no, el mensaje que se muestra al usuario."""
    minimo, maximo = limites_avance(hitos)
    if avance > maximo:
        return mensaje_tope_avance(maximo)
    if avance < minimo:
        return f"Con los pagos registrados el avance no puede ser menor a {minimo} %."
    if actual is not None and avance < actual:
        return f"El avance no puede ser menor al ya registrado ({int(actual)} %)."
    return None


def avance_tras_quitar_registro(restante, hitos) -> Decimal:
    """Avance de la obra al borrar un registro de la bitácora: el del último que queda, sin salirse de lo que permiten los pagos."""
    minimo, maximo = limites_avance(hitos)
    return min(max(restante, Decimal(minimo)), Decimal(maximo))


def abonado_y_estado(montos, monto_pago):
    """(monto abonado, estado) de un hito a partir de los montos de su libro de pagos. Lo abonado nunca supera el monto del hito."""
    abonado = min(sum(montos, Decimal(0)), monto_pago)
    estado = "PAGADO" if abonado >= monto_pago else ("ABONADO" if abonado > 0 else "PENDIENTE")
    return abonado, estado


def error_de_abono(monto, pendiente):
    """None si el abono es válido: entre $1 y lo que falta por pagar."""
    if monto <= 0 or monto > pendiente:
        return f"El monto debe estar entre $1 y lo que falta por pagar ({pesos(pendiente)})."
    return None


def repartir_diferencia(pendientes, delta):
    """Reparte `delta` entre los hitos aún sin pagar, en proporción a su porcentaje (el último absorbe el redondeo).
    Devuelve (nuevos montos, None) o (None, motivo) si no queda ningún hito pendiente o la rebaja dejaría un hito por
    debajo de lo ya cobrado en él."""
    if not pendientes:
        return None, "Todos los hitos están pagados: no se puede cambiar el monto."
    pesos_ = sum(h.porcentaje for h in pendientes) or Decimal(1)
    asignado, nuevos = Decimal(0), []
    for i, h in enumerate(pendientes):
        parte = delta - asignado if i == len(pendientes) - 1 else (delta * h.porcentaje / pesos_).quantize(Decimal("1"))
        asignado += parte
        nuevos.append(h.monto_pago + parte)
        if nuevos[-1] < h.monto_abonado:
            return None, (f"La rebaja deja el pago «{h.fase}» en {pesos(nuevos[-1])}, por debajo de los {pesos(h.monto_abonado)} que ya se cobraron. "
                          "Anule antes el abono que corresponda.")
    return nuevos, None
