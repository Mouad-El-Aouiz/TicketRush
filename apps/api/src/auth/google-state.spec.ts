import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { signGoogleState, verifyGoogleState } from './auth.module.js';

const secret = 'a'.repeat(48);
const state = {
  state: 's'.repeat(32),
  nonce: 'n'.repeat(32),
  verifier: 'v'.repeat(43),
  expiresAt: Date.now() + 60_000,
};

describe('Google OAuth state cookie', () => {
  it('round-trips a signed, unexpired PKCE transaction', () => {
    const signed = signGoogleState(state, secret);
    expect(verifyGoogleState(signed, secret)).toEqual(state);
  });

  it('rejects a modified payload or a different signing key', () => {
    const signed = signGoogleState(state, secret);
    const [payload, signature] = signed.split('.');
    expect(() => verifyGoogleState(`${payload}x.${signature}`, secret)).toThrow(
      UnauthorizedException,
    );
    expect(() => verifyGoogleState(signed, 'b'.repeat(48))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects expired OAuth transactions', () => {
    const signed = signGoogleState(
      { ...state, expiresAt: Date.now() - 1 },
      secret,
    );
    expect(() => verifyGoogleState(signed, secret)).toThrow(
      UnauthorizedException,
    );
  });
});
