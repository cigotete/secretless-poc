import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { KeycloakTokenService } from './keycloak-token.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [KeycloakTokenService],
})
export class AppModule {}
