import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tag } from '../../schemas/tag.schema';

@Injectable()
export class SimilarityDetectionService {
  constructor(
    @InjectModel(Tag.name) private tagModel: Model<Tag>,
  ) {}

  async findSimilarTags(label: string): Promise<string[]> {
    const tagCount = await this.tagModel.countDocuments();
    
    if (tagCount > 100000) {
      return this.findSimilarTagsOptimized(label);
    }
    
    const allTags = await this.tagModel.find({ isApproved: true }).select('label').lean();
    const similarTags: string[] = [];
    
    for (const tag of allTags) {
      const distance = this.calculateDistance(label, tag.label);
      if (distance <= 2 && distance > 0) {
        similarTags.push(tag.label);
      }
    }
    
    return similarTags;
  }

  private async findSimilarTagsOptimized(label: string): Promise<string[]> {
    // Pre-filter: only check tags with matching first 2 characters
    const prefix = label.substring(0, 2);
    const candidates = await this.tagModel
      .find({
        label: new RegExp(`^${prefix}`, 'i'),
        isApproved: true,
      })
      .select('label')
      .lean();
    
    const similarTags: string[] = [];
    
    for (const tag of candidates) {
      const distance = this.calculateDistance(label, tag.label);
      if (distance <= 2 && distance > 0) {
        similarTags.push(tag.label);
      }
    }
    
    return similarTags;
  }

  calculateDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],
            dp[i][j - 1],
            dp[i - 1][j - 1]
          );
        }
      }
    }
    
    return dp[m][n];
  }
}
