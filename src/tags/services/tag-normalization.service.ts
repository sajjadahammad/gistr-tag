import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class TagNormalizationService {
  normalize(label: string): string {
    // Step 1: Convert to lowercase
    let normalized = label.toLowerCase();
    
    // Step 2: Trim leading and trailing whitespace
    normalized = normalized.trim();
    
    // Step 3: Collapse multiple consecutive spaces to single space
    normalized = normalized.replace(/\s+/g, ' ');
    
    return normalized;
  }

  validate(normalizedLabel: string): void {
    if (!normalizedLabel || normalizedLabel.length === 0) {
      throw new BadRequestException('Tag label cannot be empty after normalization');
    }

    if (normalizedLabel.length < 2) {
      throw new BadRequestException('Tag label must be at least 2 characters long');
    }

    if (normalizedLabel.length > 50) {
      throw new BadRequestException('Tag label must not exceed 50 characters');
    }
  }
}
