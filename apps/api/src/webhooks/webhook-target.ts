import { isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export interface ResolvedWebhookTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

export type WebhookLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<{ address: string; family: number }[]>;

export function parseWebhookUrl(input: string) {
  if (input.length > 2048) throw new Error('Webhook URL is too long');
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Webhook URL must be an absolute HTTPS URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port ||
    !url.hostname ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(url.hostname)
  )
    throw new Error('Webhook URL is not an allowed HTTPS destination');
  return url;
}

function isPublicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

export async function resolveWebhookTarget(
  input: string,
  lookup: WebhookLookup = (hostname, options) => dnsLookup(hostname, options),
): Promise<ResolvedWebhookTarget> {
  const url = parseWebhookUrl(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some((item) => !isPublicAddress(item.address))
  )
    throw new Error('Webhook destination resolved to a non-public address');
  const first = addresses[0];
  const family = isIP(first.address);
  if ((family !== 4 && family !== 6) || family !== first.family)
    throw new Error('Webhook destination returned an invalid address family');
  return {
    url,
    address: first.address,
    family,
  };
}
