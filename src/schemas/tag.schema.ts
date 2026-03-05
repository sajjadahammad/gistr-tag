import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Tag extends Document {
  @Prop({ required: true, unique: true, index: true })
  label: string;

  @Prop({ required: true, default: 0 })
  usageCount: number;

  @Prop({
    type: {
      source: { type: Number, default: 0 },
      snippet: { type: Number, default: 0 },
      airesponse: { type: Number, default: 0 },
    },
    default: { source: 0, snippet: 0, airesponse: 0 },
  })
  entityTypeCounts: {
    source: number;
    snippet: number;
    airesponse: number;
  };

  @Prop({ required: true, default: false })
  isApproved: boolean;

  @Prop({ type: Date })
  lastUsedAt: Date;

  @Prop({ type: String, index: true })
  parentLabel?: string;
}

export const TagSchema = SchemaFactory.createForClass(Tag);

// Indexes
TagSchema.index({ lastUsedAt: -1, usageCount: -1 });
TagSchema.index({ usageCount: -1 });
