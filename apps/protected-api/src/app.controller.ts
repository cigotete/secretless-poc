import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';

import { KeycloakTokenService } from './keycloak-token.service';

@Controller()
export class AppController {
  constructor(
    private readonly keycloakTokenService: KeycloakTokenService,
  ) {}

  @Get('protected')
  async protected(
    @Headers('authorization') authorization?: string,
  ) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Bearer token requerido',
      );
    }

    const token = authorization.substring(7);

    const identity =
      await this.keycloakTokenService.validate(token);

    return {
      message: 'Acceso autorizado',
      client: identity.azp,
      subject: identity.sub,
      issuer: identity.iss,
    };
  }
}