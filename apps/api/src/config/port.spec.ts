import { parsePort } from './port.js';

describe('parsePort', () => {
  it('defaults to 3000 when PORT is not provided', () => {
    expect(parsePort(undefined)).toBe(3000);
  });

  it.each(['1', '3001', '65535'])('accepts valid port %s', (value) => {
    expect(parsePort(value)).toBe(Number(value));
  });

  it.each(['', '0', '65536', '-1', '3.5', '1e3', '3000abc', ' 3000'])(
    'rejects invalid port %s',
    (value) => {
      expect(() => parsePort(value)).toThrow(
        'PORT must be an integer between 1 and 65535',
      );
    },
  );
});
