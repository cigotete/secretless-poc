import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';

import { TokenReviewService } from './token-review.service';

@Controller()
export class AppController {
  constructor(
    private readonly tokenReviewService: TokenReviewService,
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
      await this.tokenReviewService.validate(token);

    return {
      message: 'Acceso autorizado',
      workload: identity.user.username,
      audiences: identity.audiences,
    };
  }
}