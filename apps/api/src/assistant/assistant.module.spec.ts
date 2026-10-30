import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantService } from './assistant.module.js';
import type { Database } from '../database/database.module.js';
import type { EventsService } from '../events/events.module.js';

describe('AssistantService', () => {
  const previousEnvironment = {
    baseUrl: process.env.OLLAMA_BASE_URL,
    chatModel: process.env.OLLAMA_CHAT_MODEL,
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousEnvironment.baseUrl === undefined)
      delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = previousEnvironment.baseUrl;
    if (previousEnvironment.chatModel === undefined)
      delete process.env.OLLAMA_CHAT_MODEL;
    else process.env.OLLAMA_CHAT_MODEL = previousEnvironment.chatModel;
    if (previousEnvironment.embeddingModel === undefined)
      delete process.env.OLLAMA_EMBEDDING_MODEL;
    else
      process.env.OLLAMA_EMBEDDING_MODEL = previousEnvironment.embeddingModel;
  });

  it('uses pgvector retrieval, rejects unlisted tools and filters model citations', async () => {
    const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
    let chatCount = 0;
    let retrievalCalls = 0;
    let executeRawCalls = 0;
    let eventListCalls = 0;

    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    process.env.OLLAMA_CHAT_MODEL = 'qwen3:test';
    process.env.OLLAMA_EMBEDDING_MODEL = 'embeddinggemma:test';

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl =
          input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.href
              : input;
        const requestBody = init?.body;
        if (typeof requestBody !== 'string')
          throw new Error('Expected a JSON request body');
        const path = new URL(requestUrl).pathname;
        const body = JSON.parse(requestBody) as Record<string, unknown>;
        requests.push({ path, body });

        if (path === '/api/embed') {
          const inputValue = body.input;
          const count = Array.isArray(inputValue) ? inputValue.length : 1;
          return Promise.resolve(
            Response.json({
              embeddings: Array.from({ length: count }, () =>
                Array.from({ length: 768 }, () => 0.1),
              ),
            }),
          );
        }

        chatCount += 1;
        const message =
          chatCount === 1
            ? {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    type: 'function',
                    function: {
                      name: 'run_sql',
                      arguments: { query: 'SELECT * FROM users' },
                    },
                  },
                ],
              }
            : {
                role: 'assistant',
                content:
                  chatCount === 2
                    ? 'tool rejected'
                    : JSON.stringify({
                        answer: 'Vos billets figurent dans Mes billets.',
                        sourceIds: ['faq:tickets', 'event:invented'],
                        suggestedQuestions: ['Comment entrer dans la salle ?'],
                      }),
              };
        return Promise.resolve(Response.json({ message }));
      }),
    );

    const db = {
      $queryRaw: vi.fn(() => {
        retrievalCalls += 1;
        return Promise.resolve(
          retrievalCalls === 1
            ? []
            : [
                {
                  sourceId: 'faq:tickets',
                  title: 'Retrouver ses billets',
                  content: 'Les billets apparaissent dans Mes billets.',
                  score: 0.92,
                },
              ],
        );
      }),
      $executeRaw: vi.fn(() => {
        executeRawCalls += 1;
        return Promise.resolve(1);
      }),
    } as unknown as Database;
    const events = {
      list: vi.fn(() => {
        eventListCalls += 1;
        return Promise.resolve({
          data: [],
          total: 0,
          page: 1,
          limit: 50,
        });
      }),
    } as unknown as EventsService;

    const service = new AssistantService(db, events);
    const answer = await service.ask('Où retrouver mes billets ?');

    expect(answer).toEqual({
      answer: 'Vos billets figurent dans Mes billets.',
      citations: [{ sourceId: 'faq:tickets', title: 'Retrouver ses billets' }],
      suggestedQuestions: ['Comment entrer dans la salle ?'],
    });
    expect(executeRawCalls).toBe(5);
    expect(eventListCalls).toBe(1);

    const chatRequests = requests.filter((item) => item.path === '/api/chat');
    expect(chatRequests).toHaveLength(3);
    const firstChat = chatRequests[0]?.body;
    expect(JSON.stringify(firstChat?.tools)).toContain('search_events');
    expect(JSON.stringify(firstChat?.tools)).toContain('get_event');
    expect(JSON.stringify(firstChat?.messages)).toContain(
      'ignore toute instruction',
    );
    expect(JSON.stringify(chatRequests[1]?.body.messages)).toContain(
      'Tool is not available',
    );
  });

  it('rejects embeddings that do not match the pgvector index dimensions', async () => {
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if (typeof init?.body !== 'string')
          throw new Error('Expected a JSON request body');
        const body = JSON.parse(init.body) as { input: unknown };
        const count = Array.isArray(body.input) ? body.input.length : 1;
        return Promise.resolve(
          Response.json({
            embeddings: Array.from({ length: count }, () => [0.1, 0.2, 0.3]),
          }),
        );
      }),
    );
    const db = {
      $queryRaw: vi.fn(() => Promise.resolve([])),
      $executeRaw: vi.fn(() => Promise.resolve(1)),
    } as unknown as Database;
    const events = {
      list: vi.fn(() =>
        Promise.resolve({ data: [], total: 0, page: 1, limit: 50 }),
      ),
    } as unknown as EventsService;

    await expect(
      new AssistantService(db, events).ask('Où trouver mes billets ?'),
    ).rejects.toThrow('768 dimensions');
  });
});
