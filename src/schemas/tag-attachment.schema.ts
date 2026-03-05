import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class TagAttachment extends Document {
  @Prop({ required: true })
  entityId: string;

  @Prop({ required: true, enum: ['source', 'snippet', 'airesponse'] })
  entityType: string;

  @Prop({ required: true })
  tagLabel: string;

  @Prop({ required: true, enum: ['system', 'user'] })
  source: string;

  @Prop({ required: true, default: false })
  isDeleted: boolean;
}

export const TagAttachmentSchema = SchemaFactory.createForClass(TagAttachment);

// Unique compound index for idempotency
TagAttachmentSchema.index({ entityId: 1, entityType: 1, tagLabel: 1 }, { unique: true });

// Search indexes
TagAttachmentSchema.index({ tagLabel: 1, isDeleted: 1 });
TagAttachmentSchema.index({ entityId: 1, isDeleted: 1 });
TagAttachmentSchema.index({ createdAt: -1, tagLabel: 1 });
