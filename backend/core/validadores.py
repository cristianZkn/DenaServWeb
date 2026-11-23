"""Validación y normalización de datos de contacto chilenos (RUT, teléfono, correo, textos)."""
import re

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


def dv_correcto(cuerpo: str) -> str:
    """Dígito verificador (módulo 11) que le corresponde a los números del RUN/RUT."""
    suma = sum(int(d) * f for d, f in zip(reversed(cuerpo), [2, 3, 4, 5, 6, 7] * 3))
    return {11: "0", 10: "K"}.get(11 - suma % 11, str(11 - suma % 11))


def rut_valido(rut: str) -> bool:
    return dv_correcto(rut[:-1]) == rut[-1]


def normalizar_rut(valor: str, nombre: str = "RUT") -> str:
    """'12345678-5' / '12.345.678-5' -> '12.345.678-5'. Valida largo (7-8 dígitos + DV) y dígito verificador."""
    limpio = re.sub(r"[.\-\s]", "", valor or "").upper()
    if not re.fullmatch(r"\d{7,8}[\dK]", limpio):
        raise ValueError(f"El {nombre} debe tener 7 u 8 números y un dígito verificador (0-9 o K). Ejemplo: 12.345.678-5")
    if not rut_valido(limpio):
        cuerpo = f"{int(limpio[:-1]):,}".replace(",", ".")
        raise ValueError(f"El dígito verificador del {nombre} no corresponde: para {cuerpo} debería ser {dv_correcto(limpio[:-1])}, "
                         f"no {limpio[-1]}. Revise que lo haya escrito bien.")
    cuerpo = f"{int(limpio[:-1]):,}".replace(",", ".")
    return f"{cuerpo}-{limpio[-1]}"


def normalizar_telefono(valor: str) -> str:
    """Teléfono chileno de 9 dígitos (móvil 9XXXXXXXX o fijo con código de área), con o sin +56. -> '+56 9 1234 5678'."""
    s = re.sub(r"[\s\-().]", "", valor or "")
    if not re.fullmatch(r"\+?\d+", s):
        raise ValueError("El teléfono solo puede llevar números, espacios y el signo +.")
    if s.startswith("+56"):
        s = s[3:]
    elif s.startswith("56") and len(s) == 11:
        s = s[2:]
    if not re.fullmatch(r"[2-9]\d{8}", s):
        raise ValueError("El teléfono debe tener 9 dígitos. Ejemplo: +56 9 8765 4321")
    return f"+56 {s[0]} {s[1:5]} {s[5:]}"


def validar_email(valor: str) -> str:
    v = (valor or "").strip().lower()
    if len(v) > 254 or not _EMAIL.match(v):
        if "@" not in v:
            raise ValueError("Al correo le falta el «@». Ejemplo: nombre@correo.cl")
        if re.search(r"\s", v) or v.count("@") > 1:
            raise ValueError("El correo no puede llevar espacios ni más de un «@». Ejemplo: nombre@correo.cl")
        raise ValueError("El correo está incompleto: después del «@» falta el dominio. Ejemplo: nombre@correo.cl")
    return v


def texto(valor: str, etiqueta: str, minimo: int, maximo: int) -> str:
    v = re.sub(r"\s+", " ", valor or "").strip()
    if not minimo <= len(v) <= maximo:
        raise ValueError(f"{etiqueta} debe tener entre {minimo} y {maximo} caracteres.")
    return v
