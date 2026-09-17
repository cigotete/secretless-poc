# Arquitectura y funcionamiento de la PoC Secretless

Nota: El proceso de validación de la PoC — Secretless Authentication se encuentra en el último punto de este documento.

## 1. Objetivo

El sistema desarrollado demuestra cómo una aplicación puede autenticarse ante un recurso protegido **sin almacenar un `client_secret`, contraseña o API Key**.

La idea fundamental es sustituir un secreto permanente por una **identidad del workload demostrable mediante tokens temporales**.

En esta PoC participan Kubernetes, NestJS y Keycloak. Sin embargo, los roles son genéricos y permiten comprender arquitecturas equivalentes, como **Workload Identity Federation con Microsoft Entra ID en Azure**.

---

# 2. Arquitectura general

Los componentes principales son:

```text
┌─────────────────────────────┐
│ Kubernetes API Server       │
│                             │
│ Rol genérico: OIDC Issuer   │
│ Emite JWT del workload      │
└──────────────┬──────────────┘
               │
               │ JWT Kubernetes
               ▼
┌─────────────────────────────┐
│ client-api                  │
│                             │
│ Rol genérico: Workload      │
│ / Client Application        │
│                             │
│ Identidad: client-workload  │
└──────────────┬──────────────┘
               │
               │ presenta JWT Kubernetes
               ▼
┌─────────────────────────────┐
│ Keycloak                    │
│                             │
│ Rol genérico:               │
│ Identity Provider /         │
│ Authorization Server        │
└──────────────┬──────────────┘
               │
               │ nuevo Access Token
               ▼
┌─────────────────────────────┐
│ client-api                  │
└──────────────┬──────────────┘
               │
               │ Bearer Access Token
               ▼
┌─────────────────────────────┐
│ protected-api               │
│                             │
│ Rol genérico:               │
│ Protected Resource /        │
│ Resource Server             │
└─────────────────────────────┘
```

Existe además una relación de confianza entre **Keycloak y Kubernetes** que permite a Keycloak confiar en determinados tokens emitidos por Kubernetes.

---

# 3. Componentes

## 3.1. `client-api` — Workload / Client Application

`client-api` es la aplicación NestJS que necesita acceder a un recurso protegido.

Su nombre genérico es:

**Workload** o **Client Application**.

En esta PoC:

```text
client-api → protected-api
```

En un escenario Azure podría ser:

```text
Aplicación NestJS → Azure Blob Storage
```

o:

```text
Aplicación NestJS → Azure Redis
```

La característica importante es que `client-api` **no tiene un `client_secret`** para autenticarse ante Keycloak.

---

## 3.2. `client-workload` — Workload Identity

`client-api` se ejecuta en Kubernetes utilizando el ServiceAccount:

```text
client-workload
```

Su nombre genérico es:

**Workload Identity**.

El ServiceAccount representa la identidad que Kubernetes asigna al proceso que está ejecutando la aplicación.

Conceptualmente Kubernetes afirma:

```text
"Esta aplicación está ejecutándose
como client-workload."
```

No es una contraseña ni un secreto.

Es una **identidad administrada por la plataforma donde se ejecuta el workload**.

---

## 3.3. Kubernetes API Server — OIDC Issuer

El Kubernetes API Server tiene un papel fundamental en la arquitectura.

En este sistema actúa como:

**OIDC Issuer / External Identity Issuer**.

Kubernetes genera un JWT temporal para el ServiceAccount `client-workload`.

El token contiene información como:

```text
iss → quién emitió el token

sub → quién es el workload

aud → para quién fue creado el token

exp → cuándo expira
```

Por ejemplo:

```text
iss =
https://kubernetes.default.svc.cluster.local

sub =
system:serviceaccount:default:client-workload

aud =
http://keycloak:8080/realms/secretless-poc
```

Esto significa:

> Kubernetes afirma que este token representa a `client-workload` y que fue creado para ser presentado ante Keycloak.

---

# 4. ¿Qué papel tiene OpenID Connect (OIDC)?

**OpenID Connect (OIDC)** proporciona mecanismos estandarizados para describir un emisor de identidad y permitir verificar sus tokens.

Un OIDC Issuer puede publicar información mediante:

```text
/.well-known/openid-configuration
```

y publicar sus claves públicas mediante:

**JWKS — JSON Web Key Set**.

Conceptualmente:

```text
Kubernetes
OIDC Issuer
     │
     ├── identidad del issuer
     │
     ├── configuración OIDC
     │
     └── claves públicas JWKS
              │
              ▼
          Keycloak
```

Gracias a estas claves públicas, Keycloak puede comprobar criptográficamente que un JWT realmente fue firmado por Kubernetes.

OIDC **no crea por sí solo la confianza**. La confianza entre los sistemas debe configurarse explícitamente.

---

# 5. Relación de confianza Kubernetes → Keycloak

Keycloak está configurado para reconocer a Kubernetes como proveedor externo de identidad.

Conceptualmente:

```text
Keycloak
   │
   │ confía en
   ▼
Kubernetes OIDC Issuer
```

También está configurado para reconocer que la identidad externa:

```text
system:serviceaccount:default:client-workload
```

puede representar al cliente:

```text
client-api
```

Esta configuración constituye la **relación de confianza federada**.

Es importante distinguir:

```text
Configuración de federación
        ↓
establece QUIÉN es confiable

OIDC / JWT / JWKS
        ↓
permiten COMPROBAR criptográficamente
esa identidad
```

---

# 6. Keycloak — Identity Provider / Authorization Server

Keycloak es el componente que recibe la identidad externa y emite una credencial apropiada para acceder al sistema.

Sus nombres genéricos son:

**Identity Provider (IdP)** y, para la emisión del token OAuth, **Authorization Server**.

En un escenario Azure, esta responsabilidad corresponde principalmente a:

**Microsoft Entra ID**.

Su responsabilidad principal puede resumirse como:

```text
recibir identidad externa
        ↓
validarla
        ↓
aplicar la confianza configurada
        ↓
reconocer a client-api
        ↓
emitir Access Token
```

---

# 7. `protected-api` — Protected Resource / Resource Server

`protected-api` es otra aplicación NestJS.

Su nombre genérico es:

**Protected Resource** o **Resource Server**.

Representa el recurso al cual `client-api` realmente quiere acceder.

En esta PoC:

```text
protected-api
```

En Azure podría corresponder a:

```text
Azure Blob Storage

Azure Redis

Azure SQL

otra API protegida
```

`protected-api` confía en los Access Tokens emitidos por Keycloak.

---

# 8. Flujo completo

## Paso 1 — Kubernetes asigna identidad al workload

Cuando Kubernetes crea el Pod de `client-api`, lo ejecuta utilizando:

```text
ServiceAccount:
client-workload
```

Kubernetes genera un JWT temporal asociado a esa identidad y lo proyecta dentro del Pod.

```text
Kubernetes API Server
        │
        │ genera JWT temporal
        ▼
client-api
```

Ese JWT es la prueba de identidad inicial del workload.

---

## Paso 2 — `client-api` obtiene su JWT

`client-api` puede leer el JWT desde:

```text
/var/run/secrets/workload/token
```

No necesita recuperar una contraseña desde variables de entorno, Vault o Kubernetes Secret.

La plataforma le proporciona una **credencial temporal basada en su identidad**.

---

## Paso 3 — `client-api` se autentica ante Keycloak

`client-api` presenta el JWT de Kubernetes ante Keycloak.

```text
client-api
     │
     │ JWT Kubernetes
     │
     │ "Kubernetes afirma
     │  que soy client-workload"
     ▼
Keycloak
```

El JWT funciona como una **client assertion**.

En otras palabras, `client-api` utiliza la identidad proporcionada por su plataforma en lugar de utilizar:

```text
client_id + client_secret
```

---

## Paso 4 — Keycloak valida el JWT

Keycloak determina si puede confiar en el JWT presentado.

Conceptualmente verifica:

```text
¿Quién lo emitió?
        │
        ▼
      issuer

¿La firma es válida?
        │
        ▼
   OIDC / JWKS

¿A quién representa?
        │
        ▼
      subject

¿Fue creado para mí?
        │
        ▼
     audience

¿Sigue vigente?
        │
        ▼
    expiration
```

La relación federada configurada permite que Keycloak reconozca:

```text
system:serviceaccount:default:client-workload
```

como una identidad válida para:

```text
client-api
```

---

# 9. Keycloak emite un nuevo Access Token

Una vez autenticado `client-api`, Keycloak emite un **nuevo token**.

Durante el proceso existen dos tokens diferentes:

```text
TOKEN #1

JWT Kubernetes
Issuer = Kubernetes

Sirve para demostrar
la identidad del workload.

        │
        ▼

     Keycloak

        │
        ▼

TOKEN #2

Access Token
Issuer = Keycloak

Sirve para acceder
al recurso protegido.
```

El segundo token no es simplemente el JWT de Kubernetes reenviado.

Es una **nueva credencial emitida por Keycloak** después de validar la identidad federada.

---

# 10. `client-api` llama a `protected-api`

`client-api` utiliza el Access Token de Keycloak:

```text
GET /protected

Authorization:
Bearer <Access Token Keycloak>
```

Por tanto:

```text
client-api
     │
     │ Access Token Keycloak
     ▼
protected-api
```

El JWT original de Kubernetes **no se envía a `protected-api`**.

---

# 11. `protected-api` valida el Access Token

`protected-api` confía en Keycloak como emisor.

Utiliza las claves públicas de Keycloak para verificar la firma del token y comprueba claims como:

```text
iss
exp
azp
```

En esta implementación se comprueba, entre otras cosas:

```text
azp = client-api
```

Si el token es válido:

```text
protected-api
      │
      ▼
200 OK

Acceso autorizado
```

---

# 12. Flujo completo resumido

```text
┌──────────────────────────────┐
│ Kubernetes API Server        │
│                              │
│ OIDC Issuer                  │
└──────────────┬───────────────┘
               │
        JWT Kubernetes
               │
               │ identifica:
               │ client-workload
               ▼
┌──────────────────────────────┐
│ client-api                   │
│ Workload / Client            │
└──────────────┬───────────────┘
               │
               │ presenta JWT
               ▼
┌──────────────────────────────┐
│ Keycloak                     │◄──────────────┐
│                              │               │
│ Identity Provider /          │ OIDC + JWKS   │
│ Authorization Server         │               │
└──────────────┬───────────────┘               │
               │                               │
               └───────────────────────────────┘
                    Kubernetes API Server

               │
        Access Token nuevo
               │
               ▼
┌──────────────────────────────┐
│ client-api                   │
└──────────────┬───────────────┘
               │
               │ Bearer Access Token
               ▼
┌──────────────────────────────┐
│ protected-api                │
│                              │
│ Protected Resource /         │
│ Resource Server              │
└──────────────────────────────┘
```

---

# 13. ¿Por qué es Secretless?

En una autenticación basada en secreto podríamos utilizar:

```text
client-api
    │
    ├── client_id
    └── client_secret
             │
             ▼
          Keycloak
```

El `client_secret` tendría que almacenarse, protegerse y rotarse.

En esta solución:

```text
client-api
    │
    │ JWT temporal
    │ proporcionado por Kubernetes
    ▼
Keycloak
```

No existe un secreto permanente de aplicación que deba distribuirse.

La confianza se basa en:

**identidad del workload + tokens temporales + criptografía + relación federada configurada.**

---

# 14. Relación con Azure

Los productos concretos cambian, pero los roles arquitectónicos permanecen.

| Rol genérico | PoC | Escenario Azure |
|---|---|---|
| Workload / Client Application | `client-api` | Aplicación NestJS externa |
| Workload Identity | ServiceAccount `client-workload` | Identidad proporcionada por la plataforma externa |
| External OIDC Issuer | Kubernetes API Server | Kubernetes, GitHub u otro OIDC Issuer |
| External Identity Token | JWT Kubernetes | JWT/OIDC token externo |
| Identity Provider / Authorization Server | Keycloak | Microsoft Entra ID |
| Relación de confianza | Federación configurada en Keycloak | Federated Identity Credential |
| Access Token | Token emitido por Keycloak | Azure Access Token |
| Protected Resource | `protected-api` | Blob Storage, Redis, etc. |

El flujo de la PoC es:

```text
Kubernetes
OIDC Issuer
     │
     │ JWT externo
     ▼
client-api
     │
     │ presenta identidad
     ▼
Keycloak
     │
     │ valida federación
     │
     │ emite Access Token
     ▼
client-api
     │
     │ Access Token
     ▼
protected-api
```

Su equivalente conceptual en Azure es:

```text
Plataforma externa
OIDC Issuer
     │
     │ JWT externo
     ▼
Aplicación NestJS
     │
     │ presenta identidad
     ▼
Microsoft Entra ID
     │
     │ valida Federated
     │ Identity Credential
     │
     │ emite Azure Access Token
     ▼
Aplicación NestJS
     │
     │ Azure Access Token
     ▼
Blob Storage / Redis
```

La idea esencial es la misma: **la aplicación no demuestra quién es mediante un secreto compartido; utiliza una identidad proporcionada por la plataforma donde se ejecuta. El sistema de identidad confía federadamente en esa plataforma, verifica el token temporal y emite un nuevo Access Token para acceder al recurso final.**


# 15. Proceso de validación de la PoC — Secretless Authentication

Este documento describe los pasos necesarios para validar la prueba de concepto de **Secretless Authentication** implementada con Kubernetes (Kind), NestJS y Keycloak.

La validación comprueba que `client-api` puede acceder a `protected-api` utilizando su **identidad de workload y tokens temporales**, sin utilizar un `client_secret`.

## 1. Verificar los componentes

Compruebe que los Pods estén ejecutándose:

```powershell
kubectl get pods
```

Se deben observar los siguientes componentes en estado `Running`:

```text
client-api-...       1/1   Running
protected-api-...    1/1   Running
keycloak-...         1/1   Running
```

## 2. Crear port-forward hacia `client-api`

Abra una terminal y ejecute:

```powershell
kubectl port-forward deployment/client-api 3001:3000
```

Mantenga esta terminal abierta.

Esto permite acceder desde Windows a `client-api` mediante:

```text
http://localhost:3001
```

## 3. Ejecutar la prueba completa

Desde otra terminal ejecute:

```powershell
curl.exe http://localhost:3001/call-protected
```

El resultado esperado es similar a:

```json
{
  "message": "Acceso autorizado",
  "client": "client-api",
  "subject": "...",
  "issuer": "http://keycloak:8080/realms/secretless-poc"
}
```

Un resultado exitoso valida el siguiente flujo:

```text
client-api
    │
    │ JWT temporal de Kubernetes
    ▼
Keycloak
    │
    │ valida identidad federada
    │
    │ emite nuevo Access Token
    ▼
client-api
    │
    │ Bearer Access Token
    ▼
protected-api
    │
    │ valida token de Keycloak
    ▼
200 - Acceso autorizado
```

## 4. Inspeccionar el JWT de Kubernetes

Para comprobar la identidad que Kubernetes proporciona a `client-api`, ejecute:

```powershell
kubectl exec deployment/client-api -- node -e "const fs=require('fs'); const t=fs.readFileSync('/var/run/secrets/workload/token','utf8'); console.log(JSON.stringify(JSON.parse(Buffer.from(t.split('.')[1],'base64url').toString()),null,2))"
```

Entre los claims se deben observar valores similares a:

```text
iss = https://kubernetes.default.svc.cluster.local

sub = system:serviceaccount:default:client-workload

aud = http://keycloak:8080/realms/secretless-poc
```

Donde:

* `iss`: identifica a Kubernetes como emisor del JWT.
* `sub`: identifica al workload mediante su ServiceAccount.
* `aud`: indica que el JWT fue generado para ser presentado ante Keycloak.
* `exp`: establece la expiración del token.

Este JWT es una credencial temporal proporcionada por Kubernetes a la aplicación.

## 5. Validar que `protected-api` rechaza accesos anónimos

Para comprobar que `protected-api` no permite acceder directamente sin autenticación, abra otra terminal:

```powershell
kubectl port-forward deployment/protected-api 3002:3000
```

Mantenga esta terminal abierta.

Ahora ejecute:

```powershell
curl.exe http://localhost:3002/protected
```

La petición debe ser rechazada, normalmente mediante:

```text
401 Unauthorized
```

La razón es que la petición directa no contiene:

```text
Authorization: Bearer <Access Token>
```

Por tanto:

```text
Acceso directo

Usuario
   │
   ▼
protected-api
   │
   └── ❌ Sin Access Token


Acceso mediante client-api

Usuario
   │
   ▼
client-api
   │
   │ autenticación federada
   ▼
Keycloak
   │
   │ Access Token
   ▼
client-api
   │
   ▼
protected-api
   │
   └── ✅ Acceso autorizado
```

## 6. Acceder a la consola de Keycloak

Como información adicional, se puede acceder a la consola administrativa de Keycloak mediante un port-forward.

Abra otra terminal:

```powershell
kubectl port-forward service/keycloak 8080:8080
```

Mantenga la terminal abierta.

Luego abra en el navegador:

```text
http://localhost:8080
```

Para esta PoC las credenciales configuradas son:

```text
Usuario: admin
Contraseña: admin
```

Desde la consola se puede inspeccionar el realm:

```text
secretless-poc
```

y revisar la configuración relacionada con `client-api` y la identidad federada de Kubernetes.

> Las credenciales `admin/admin` y el modo de ejecución utilizado para Keycloak son exclusivamente para esta PoC local y no representan una configuración apropiada para producción.

## 7. Diagnóstico de errores

Si la prueba completa falla, consulte primero los logs de `client-api`:

```powershell
kubectl logs deployment/client-api --tail=100
```

Para revisar la validación realizada por el recurso protegido:

```powershell
kubectl logs deployment/protected-api --tail=100
```

Y para problemas relacionados con autenticación federada o emisión del Access Token:

```powershell
kubectl logs deployment/keycloak --tail=100
```

## 8. Criterio de validación

La PoC se considera validada cuando se cumplen ambos escenarios:

| Prueba                                          | Resultado esperado        |
| ----------------------------------------------- | ------------------------- |
| `curl.exe http://localhost:3001/call-protected` | `200 - Acceso autorizado` |
| `curl.exe http://localhost:3002/protected`      | `401 - Unauthorized`      |

El primer escenario demuestra que `client-api` puede autenticarse mediante su identidad de workload, obtener un Access Token y consumir el recurso protegido.

El segundo demuestra que `protected-api` no permite el acceso cuando no se presenta una credencial válida.

Por tanto, la prueba demuestra el flujo:

```text
Kubernetes
OIDC Issuer
     │
     │ JWT temporal
     ▼
client-api
     │
     │ presenta identidad
     ▼
Keycloak
     │
     │ valida federación
     │
     │ emite Access Token
     ▼
client-api
     │
     │ Access Token
     ▼
protected-api
     │
     ▼
Acceso autorizado
```

El objetivo principal de la PoC es demostrar que **`client-api` puede autenticarse y acceder al recurso protegido sin almacenar un `client_secret`, utilizando en su lugar una identidad de workload, federación y credenciales temporales**.
