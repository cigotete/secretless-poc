import { Controller, Get } from '@nestjs/common';
import { ProtectedApiService } from './protected-api.service';

@Controller()
export class AppController {
  constructor(
    private readonly protectedApiService: ProtectedApiService,
  ) {}

  @Get()
  getHello() {
    return {
      service: 'client-api',
      status: 'running',
    };
  }

  @Get('call-protected')
  async callProtectedApi() {
    return this.protectedApiService.callProtectedApi();
  }
}