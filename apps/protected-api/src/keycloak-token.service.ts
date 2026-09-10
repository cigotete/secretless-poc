import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  createRemoteJWKSet,
  jwtVerify,
} from 'jose';

@Injectable()
export class KeycloakTokenService {
  private readonly issuer =
    'http://keycloak:8080/realms/secretless-poc';

  private readonly jwks = createRemoteJWKSet(
    new URL(
      `${this.issuer}/protocol/openid-connect/certs`,
    ),
  );

  async validate(token: string) {
    try {
      const { payload } = await jwtVerify(
        token,
        this.jwks,
        {
          // Verificamos que el token fue emitido
          // por nuestro Realm de Keycloak.
          issuer: this.issuer,
        },
      );

      // Para esta PoC esperamos que el token
      // represente al cliente "client-api".
      if (payload.azp !== 'client-api') {
        throw new UnauthorizedException(
          'Cliente no autorizado',
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException(
        'Access token inválido',
      );
    }
  }
}