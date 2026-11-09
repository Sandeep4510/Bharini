jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri, exists: true })),
}));

import { File } from 'expo-file-system';

import { ageFrom, fieldErrors, messageOf, toUpload } from '@/lib/config';

describe('mobile config helpers', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns no age for an absent date of birth', () => {
    expect(ageFrom(null)).toBeNull();
  });

  it('calculates age before, on, and after the birthday', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-10T12:00:00Z'));
    expect(ageFrom('2000-05-11')).toBe(25);
    expect(ageFrom('2000-05-10')).toBe(26);
    expect(ageFrom('2000-05-09')).toBe(26);
  });

  it('returns the first nested server field error and handles malformed error shapes', () => {
    expect(fieldErrors({ fieldErrors: { email: [['Invalid email', 'Try again']], bio: [] } })).toEqual({
      email: 'Invalid email',
      bio: '',
    });
    expect(fieldErrors(null)).toEqual({});
    expect(fieldErrors({ fieldErrors: { field: 'bad input' } })).toEqual({ field: 'bad input' });
  });

  it('extracts an Error message and uses the fallback for non-errors', () => {
    expect(messageOf(new Error('offline'), 'fallback')).toBe('offline');
    expect(messageOf({ message: 'untrusted' }, 'fallback')).toBe('fallback');
  });

  it('wraps an existing picked file and refuses a missing file', () => {
    const upload = toUpload({ uri: 'file:///cache/photo.jpg' });
    expect(File).toHaveBeenCalledWith('file:///cache/photo.jpg');
    expect(upload).toMatchObject({ uri: 'file:///cache/photo.jpg' });

    jest.mocked(File).mockImplementationOnce((...args) => ({ uri: String(args[0]), exists: false } as File));
    expect(() => toUpload({ uri: 'file:///cache/missing.jpg' })).toThrow(
      'Could not read the selected file. Try picking it again.',
    );
  });
});
