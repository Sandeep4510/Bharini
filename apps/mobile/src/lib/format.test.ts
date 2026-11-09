import { plural, timeAgo } from '@/lib/format';

describe('feed and chat formatting', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    [0, 'now'],
    [59, 'now'],
    [60, '1m'],
    [3599, '59m'],
    [3600, '1h'],
    [86399, '23h'],
    [86400, '1d'],
    [6 * 86400, '6d'],
  ])('formats timestamps %i seconds old', (seconds, expected) => {
    expect(timeAgo(new Date(Date.now() - seconds * 1000).toISOString())).toBe(expected);
  });

  it('clamps future timestamps to "now"', () => {
    expect(timeAgo('2026-11-02T12:00:00Z')).toBe('now');
  });

  it('formats singular, plural, and custom plural labels', () => {
    expect(plural(1, 'message')).toBe('1 message');
    expect(plural(0, 'message')).toBe('0 messages');
    expect(plural(2, 'person', 'people')).toBe('2 people');
  });
});
