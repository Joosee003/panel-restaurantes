# Proxy de WAHA en el Nginx del servidor

Estas plantillas son específicas para `waha.gastrohelp.es` y el WAHA que escucha en `127.0.0.1:3000`. No cambian el vhost ni el puerto de n8n. No contienen claves. Instalar una sola fase en `/etc/nginx/sites-available/gastrohelp-waha`: la fase HTTPS reemplaza la HTTP e incluye el challenge necesario para renovar el certificado.

## 1. HTTP mientras se prepara DNS y certificado

Revisar que esa ruta y el enlace de `sites-enabled` no pertenezcan ya a otro servicio. Desde esta carpeta:

```bash
install -d -m 755 /var/www/gastrohelp-acme/.well-known/acme-challenge
install -m 644 waha.http.conf /etc/nginx/sites-available/gastrohelp-waha
ln -s /etc/nginx/sites-available/gastrohelp-waha /etc/nginx/sites-enabled/gastrohelp-waha
nginx -t
systemctl reload nginx
```

Ejecutar el reload solo si `nginx -t` termina correctamente. No reiniciar Nginx ni Docker. Esta fase devuelve 404 en cualquier ruta ajena al challenge; no permite llamar a WAHA por HTTP.

Crear el registro A de `waha` en el proveedor DNS autoritativo apuntando a la IPv4 pública del servidor. Si existe un AAAA, debe apuntar a una IPv6 de este mismo servidor y funcionar; no crear uno por suposición. Comprobar también que cualquier CAA aplicable permita a la autoridad del certificado emitirlo. No solicitar el certificado hasta que la resolución y el challenge HTTP sean comprobables desde fuera.

Para probar el challenge, crear un fichero temporal con un texto público aleatorio bajo `.well-known/acme-challenge/` y recuperarlo por HTTP. Retirarlo después. Un GET a `/api/sessions` debe seguir devolviendo 404 durante esta fase.

## 2. Certificado sin modificar otros vhosts

Usar la cuenta Certbot ya autorizada en este servidor. El modo webroot escribe el challenge y no detiene Nginx ni reescribe su configuración:

```bash
certbot certonly --webroot --webroot-path /var/www/gastrohelp-acme --cert-name waha.gastrohelp.es -d waha.gastrohelp.es
```

No usar `--nginx`, `standalone`, `--expand` sobre el certificado de n8n ni forzar renovaciones repetidas. Si hay más de una cuenta Certbot, elegir la cuenta existente correspondiente; no registrar otra sin necesidad. Comprobar que se crearon `fullchain.pem` y `privkey.pem` en el nombre indicado, sin imprimir la clave.

## 3. HTTPS con las rutas del backend

Guardar una copia del pequeño vhost HTTP antes de reemplazarlo. La copia debe quedar fuera de `sites-enabled` y fuera de cualquier comodín que cargue Nginx. Instalar:

```bash
install -m 644 gastrohelp-waha-proxy.conf /etc/nginx/snippets/gastrohelp-waha-proxy.conf
install -m 644 waha.https.conf /etc/nginx/sites-available/gastrohelp-waha
nginx -t
systemctl reload nginx
```

Si la validación falla, reponer el vhost HTTP y volver a validarlo; no ejecutar reload con una configuración inválida. Esta plantilla usa el contexto `http` habitual de `sites-enabled` en Ubuntu y no debe incluirse dentro de otro bloque `server`.

La API solo admite los métodos y rutas de `lib/whatsapp/waha-api.ts` más las lecturas del preflight. Los parámetros de URL están prohibidos salvo `format=image` en el QR, por lo que no se puede autenticar usando `?x-api-key=...`. La clave viaja en `X-Api-Key` y WAHA comprueba su valor. Faltando el header, Nginx responde 401 antes de alcanzar WAHA.

Los límites iniciales son 64 KiB de cuerpo, 20 peticiones/segundo por IP con ráfaga de 40 y 20 conexiones concurrentes por IP. Están pensados para el piloto. El tráfico de varios restaurantes puede compartir IP de salida de Vercel; revisar 429 y medir antes de aumentar conexiones. Los POST no se reintentan en el proxy.

No se guardan access logs ni errores de petición del vhost: Nginx puede incluir la URI con un LID en sus errores. No se escriben cuerpos/QR en archivos de buffering ni se habilita caché. La salud del contenedor y las comprobaciones externas dan la señal operativa; no habilitar debug para investigar con números reales.

## 4. Prueba mínima

Desde `infra/waha`:

```bash
python3 preflight.py --network
```

Además, comprobar sin enviar mensajes:

| Petición HTTPS | Resultado esperado |
| --- | --- |
| GET `/api/sessions` sin clave | 401 |
| GET `/api/sessions` con clave incorrecta | 401 o 403 |
| GET `/api/server/version` con clave correcta | 200, versión 2026.8.2 y motor GOWS |
| GET `/api/sessions?x-api-key=cualquier-cosa` | 400 |
| GET `/api/server/environment`, `/api/server/stop`, `/health`, `/metrics`, `/ws`, `/` | 404 |
| DELETE `/api/sessions` | 405 |
| GET de QR con un parámetro extra | 400 |
| GET de QR sin parámetros | 400; el backend utiliza `format=image` |

Comprobar también que `n8n.gastrohelp.es` responde tras cada reload. Después conectar el número desde el panel, comprobar recepción del QR y la identidad real, y comenzar la prueba de mensajes autorizada. La tabla no sustituye ese recorrido real.

## 5. Renovación y vuelta atrás

Comprobar el timer/cron Certbot existente; no añadir otro. La renovación webroot exige mantener operativo el bloque HTTP. Revisar que un deploy hook recargue Nginx tras renovar el certificado; si ya existe uno apropiado, reutilizarlo. Un certificado renovado en disco necesita reload para que Nginx lo sirva. Validar con `certbot renew --cert-name waha.gastrohelp.es --dry-run` una vez establecido DNS/TLS.

Para volver a la fase HTTP, reponer únicamente `waha.http.conf` en el mismo vhost, validar y recargar. Esto deja WAHA inaccesible desde fuera y conserva n8n; pausar primero los canales activados en el panel para que no sigan acumulando intentos.

Referencias: [proxy de Nginx](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [rutas y límites de Nginx](https://nginx.org/en/docs/http/ngx_http_core_module.html), [Certbot webroot](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot).
