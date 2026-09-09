import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ProtectedApiService } from './protected-api.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [ProtectedApiService],
})
export class AppModule {}
