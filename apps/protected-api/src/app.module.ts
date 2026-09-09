import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { TokenReviewService } from './token-review.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [TokenReviewService],
})
export class AppModule {}
