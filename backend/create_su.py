import os
import sys
import django

sys.path.append(r'b:\proyectos\DenaServWeb\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(nombre_usuario='admin').exists():
    User.objects.create_superuser(correo_electronico='admin@ejemplo.com', nombre_usuario='admin', password='admin')
    print('Superusuario creado exitosamente.')
else:
    print('Superusuario ya existe.')
