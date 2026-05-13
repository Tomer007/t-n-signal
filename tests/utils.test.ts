import { describe, it, expect } from 'vitest';
import { cn } from '../lib/utils';

describe('cn utility', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end');
  });

  it('merges tailwind classes correctly', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6');
  });

  it('merges conflicting tailwind utilities', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles empty input', () => {
    expect(cn()).toBe('');
  });

  it('handles array input via clsx', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('handles object input via clsx', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('handles complex tailwind merge', () => {
    expect(cn('p-4 bg-red-500', 'bg-blue-500')).toBe('p-4 bg-blue-500');
  });

  it('preserves non-conflicting classes', () => {
    expect(cn('rounded-lg shadow-md', 'border')).toBe('rounded-lg shadow-md border');
  });
});
