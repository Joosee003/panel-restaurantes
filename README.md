# Panel GastroHelp

Panel multi-restaurante de GastroHelp desarrollado con Next.js, TypeScript, Tailwind y Supabase.

- Producción: https://panel.gastrohelp.es
- Demo pública: https://panel.gastrohelp.es/demo
- Repositorio: `Joosee003/panel-restaurantes`
- Rama de producción: `main`
- Hosting: Vercel

## Función del proyecto

El panel centraliza, según los módulos activos de cada restaurante:

- reservas;
- clientes e historial;
- reseñas y seguimiento;
- fidelización y cupones;
- carta QR y pedidos;
- sala y cocina;
- rentabilidad;
- administración multi-restaurante.

## Demo pública

La ruta `/demo` utiliza un restaurante ficticio y debe permanecer separada de las cuentas reales.

Reglas obligatorias:

- no mostrar datos reales;
- no permitir escrituras;
- no compartir la sesión privada del usuario;
- marcar la ruta con `noindex, nofollow`;
- mantener el acceso sin registro;
- comprobar reservas, clientes, reseñas, fidelización y rentabilidad después de cada cambio importante.

## Desarrollo local

```bash
npm install
npm run dev
```

Abrir:

- `http://localhost:3000` para el panel;
- `http://localhost:3000/demo` para la demostración.

## Comprobaciones

```bash
npm run lint
npm run build
```

El build necesita las variables de entorno requeridas por Supabase. Las credenciales nunca deben guardarse en el repositorio.

## Despliegue

El proyecto se despliega automáticamente en Vercel desde `main`.

Proyecto confirmado:

- Nombre: `panel-restaurantes`
- ID: `prj_Rqlfs38eGVHBGlfqFWT9xUrVAGvA`
- Dominio principal: `panel.gastrohelp.es`

Antes de fusionar cambios:

1. Trabajar en una rama separada.
2. Ejecutar lint.
3. Revisar el despliegue de previsualización de Vercel.
4. Probar `/login` y `/demo`.
5. Confirmar que la demo sigue siendo ficticia y de solo lectura.
6. Confirmar que no se han añadido secretos ni datos personales.

Después de fusionar:

1. Esperar a que el despliegue quede `READY`.
2. Verificar el commit servido por Vercel.
3. Abrir el dominio principal y la demo.
4. Revisar los errores de ejecución.
5. Registrar cualquier incidencia y el despliegue al que se volvería en caso de rollback.

## Seguridad

- Los archivos `.env*` están excluidos del repositorio.
- Las claves públicas y privadas deben distinguirse correctamente.
- Las políticas RLS de Supabase son parte de la seguridad, no un detalle opcional.
- La cuenta demo debe estar protegida también en base de datos, no solo en la interfaz.
- El repositorio es público: no deben aparecer secretos, identificadores sensibles de clientes ni datos reales.

## Documentación

- `docs/PRODUCTION_AUDIT.md`: estado confirmado de GitHub, Vercel, dominio y demo.
