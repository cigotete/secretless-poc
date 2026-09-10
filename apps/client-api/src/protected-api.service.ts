import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';

@Injectable()
export class ProtectedApiService {
  private readonly tokenPath = '/var/run/secrets/workload/token';

  async callProtectedApi() {
    // 1. JWT emitido por Kubernetes para client-workload
    const kubernetesToken = await readFile(
      this.tokenPath,
      'utf8',
    );

    // 2. Se solicita a Keycloak un nuevo access token
    const tokenResponse = await fetch(
      'http://keycloak:8080/realms/secretless-poc/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',

          client_id: 'client-api',

          // El JWT de Kubernetes se presenta como
          // credencial del cliente.
          client_assertion_type:
            'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',

          client_assertion: kubernetesToken,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();

      throw new Error(
        `Keycloak rechazó el token: ${tokenResponse.status} ${error}`,
      );
    }

    const tokenResult = await tokenResponse.json();

    const accessToken = tokenResult.access_token;

    // 3. Ahora se llama a protected-api usando
    // el token emitido por Keycloak, NO el de Kubernetes.
    const response = await fetch(
      'http://protected-api:3000/protected',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `protected-api respondió HTTP ${response.status}`,
      );
    }

    return response.json();
  }
}