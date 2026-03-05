import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Source extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  description?: string;

  @Prop({ required: true, default: false, index: true })
  isDeleted: boolean;
}

export const SourceSchema = SchemaFactory.createForClass(Source);
