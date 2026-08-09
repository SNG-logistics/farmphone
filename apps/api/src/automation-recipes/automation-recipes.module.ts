import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { AutomationRecipesController } from './automation-recipes.controller';
import { AutomationRecipesService } from './automation-recipes.service';

@Module({
  imports: [JobsModule],
  controllers: [AutomationRecipesController],
  providers: [AutomationRecipesService],
  exports: [AutomationRecipesService],
})
export class AutomationRecipesModule {}
