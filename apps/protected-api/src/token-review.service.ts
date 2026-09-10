import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { readFile } from 'node:fs/promises';
import { Agent, fetch } from 'undici';

@Injectable()
export class TokenReviewService {
  private readonly kubernetesApi =
    'https://kubernetes.default.svc';

  async validate(token: string) {
    // Este es el token propio de protected-api.
    // Kubernetes lo monta automáticamente en el Pod.
    //
    // Se usa para que protected-api tenga permiso
    // de llamar al API Server de Kubernetes.
    const serviceAccountToken = await readFile(
      '/var/run/secrets/kubernetes.io/serviceaccount/token',
      'utf8',
    );

    // CA interna del cluster.
    const ca = await readFile(
      '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
      'utf8',
    );

    // Cliente HTTPS que confía específicamente
    // en la CA del cluster Kubernetes.
    const dispatcher = new Agent({
      connect: {
        ca,
      },
    });

    const response = await fetch(
      `${this.kubernetesApi}/apis/authentication.k8s.io/v1/tokenreviews`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',

          // Identidad de protected-api ante Kubernetes.
          Authorization: `Bearer ${serviceAccountToken}`,
        },

        body: JSON.stringify({
          apiVersion: 'authentication.k8s.io/v1',
          kind: 'TokenReview',

          spec: {
            // Token que client-api envió.
            token,

            // Solo se aceptan tokens emitidos
            // específicamente para protected-api.
            audiences: ['protected-api'],
          },
        }),

        dispatcher,
      },
    );

    if (!response.ok) {
      throw new UnauthorizedException(
        `TokenReview falló con HTTP ${response.status}`,
      );
    }

    const review: any = await response.json();

    if (!review.status?.authenticated) {
      throw new UnauthorizedException(
        'Token inválido',
      );
    }

    // Además se verifica explícitamente quién es
    // el workload autorizado.
    if (
      review.status.user?.username !==
      'system:serviceaccount:default:client-workload'
    ) {
      throw new UnauthorizedException(
        'Workload no autorizado',
      );
    }

    return review.status;
  }
}