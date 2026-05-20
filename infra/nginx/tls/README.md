# TLS Placeholder

Place production TLS files here only on the server:

- `fullchain.pem`
- `privkey.pem`

Do not commit real certificates or private keys. Use an automated certificate
manager such as certbot, Caddy, Traefik, or a cloud load balancer before exposing
the service beyond localhost.
