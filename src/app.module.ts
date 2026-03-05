import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TagsModule } from './tags/tags.module';
import { EntitiesModule } from './entities/entities.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/gistr'),
    TagsModule,
    EntitiesModule,
    SearchModule,
  ],
})
export class AppModule {}
