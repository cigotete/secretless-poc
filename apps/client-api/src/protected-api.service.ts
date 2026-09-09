import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';

@Injectable()
export class ProtectedApiService {
  private readonly tokenPath = '/var/run/secrets/workload/token';

  async callProtectedApi() {
    // Kubernetes mantiene este archivo con el JWT temporal
    // asociado al ServiceAccount "client-workload".
    const token = await readFile(this.tokenPath, 'utf8');

    // La URL vendrá desde Kubernetes mediante una variable
    // de entorno.
    const protectedApiUrl =
      process.env.PROTECTED_API_URL ?? 'http://protected-api:3000';

    const response = await fetch(`${protectedApiUrl}/protected`, {
      headers: {
        // Se envía el JWT generado por Kubernetes.
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `protected-api respondió con HTTP ${response.status}`,
      );
    }

    return response.json();
  }
}