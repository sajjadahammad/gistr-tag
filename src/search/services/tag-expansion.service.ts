import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tag } from '../../schemas/tag.schema';

@Injectable()
export class TagExpansionService {
  constructor(
    @InjectModel(Tag.name) private tagModel: Model<Tag>,
  ) {}

  async expandTags(tagLabels: string[]): Promise<string[]> {
    const expanded = new Set<string>(tagLabels);
    
    for (const label of tagLabels) {
      const tag = await this.tagModel.findOne({ label });
      
      if (tag?.parentLabel) {
        expanded.add(tag.parentLabel);
      }
      
      const children = await this.tagModel.find({ parentLabel: label }).select('label').lean();
      children.forEach(child => expanded.add(child.label));
    }
    
    return Array.from(expanded);
  }

  async getChildren(parentLabel: string): Promise<string[]> {
    const children = await this.tagModel.find({ parentLabel }).select('label').lean();
    return children.map(c => c.label);
  }

  async getParent(childLabel: string): Promise<string | null> {
    const tag = await this.tagModel.findOne({ label: childLabel }).select('parentLabel').lean();
    return tag?.parentLabel || null;
  }
}
