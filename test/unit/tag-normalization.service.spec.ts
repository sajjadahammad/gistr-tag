import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TagNormalizationService } from '../../src/tags/services/tag-normalization.service';

describe('TagNormalizationService', () => {
  let service: TagNormalizationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagNormalizationService],
    }).compile();

    service = module.get<TagNormalizationService>(TagNormalizationService);
  });

  describe('normalize', () => {
    it('should convert to lowercase', () => {
      expect(service.normalize('JavaScript')).toBe('javascript');
      expect(service.normalize('MONGODB')).toBe('mongodb');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(service.normalize('  javascript  ')).toBe('javascript');
      expect(service.normalize('\tmongodb\n')).toBe('mongodb');
    });

    it('should collapse multiple spaces to single space', () => {
      expect(service.normalize('node    js')).toBe('node js');
      expect(service.normalize('web  development')).toBe('web development');
    });

    it('should apply all normalizations together', () => {
      expect(service.normalize('  JavaScript   Framework  ')).toBe('javascript framework');
    });

    it('should handle already normalized strings', () => {
      expect(service.normalize('javascript')).toBe('javascript');
    });
  });

  describe('validate', () => {
    it('should accept valid tag labels', () => {
      expect(() => service.validate('js')).not.toThrow();
      expect(() => service.validate('javascript')).not.toThrow();
      expect(() => service.validate('a'.repeat(50))).not.toThrow();
    });

    it('should reject empty labels', () => {
      expect(() => service.validate('')).toThrow(BadRequestException);
      expect(() => service.validate('')).toThrow('cannot be empty');
    });

    it('should reject labels shorter than 2 characters', () => {
      expect(() => service.validate('a')).toThrow(BadRequestException);
      expect(() => service.validate('a')).toThrow('at least 2 characters');
    });

    it('should reject labels longer than 50 characters', () => {
      expect(() => service.validate('a'.repeat(51))).toThrow(BadRequestException);
      expect(() => service.validate('a'.repeat(51))).toThrow('not exceed 50 characters');
    });

    it('should validate after normalization', () => {
      // This would be empty after normalization
      const normalized = service.normalize('   ');
      expect(() => service.validate(normalized)).toThrow(BadRequestException);
    });
  });
});
