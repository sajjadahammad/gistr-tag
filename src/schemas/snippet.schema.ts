import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Snippet extends Document {
  @Prop({ required: true })
  content: string;

  @Prop({ required: true })
  sourceId: string;

  @Prop()
  notes?: string;

  @Prop({ required: true, default: false, index: true })
  isDeleted: boolean;
}

export const SnippetSchema = SchemaFactory.createForClass(Snippet);
