import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class AIResponse extends Document {
  @Prop({ required: true })
  question: string;

  @Prop({ required: true })
  answer: string;

  @Prop()
  context?: string;

  @Prop({ required: true, default: false, index: true })
  isDeleted: boolean;
}

export const AIResponseSchema = SchemaFactory.createForClass(AIResponse);
