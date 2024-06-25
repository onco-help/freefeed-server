/* eslint-env node, mocha */

import expect from 'unexpected';

import cleanDB from '../dbCleaner';

import { authHeaders, createTestUsers, performJSONRequest } from './functional_test_helper';

/* global $pg_database */
describe('sparseMatches', () => {
  before(() => cleanDB($pg_database));

  let luna;
  before(
    async () =>
      ([luna] = await createTestUsers([
        'luna',
        'uranus',
        'antenna',
        'mars',
        'venus',
        'jupiter',
        'saturn',
      ])),
  );

  it('should not allow to search as anonymous', async () => {
    const result = await performJSONRequest('GET', '/v2/users/sparseMatches', null);
    expect(result, 'to satisfy', { __httpCode: 401 });
  });

  it('should not allow to call without search string', async () => {
    const result = await performJSONRequest(
      'GET',
      '/v2/users/sparseMatches',
      null,
      authHeaders(luna),
    );
    expect(result, 'to satisfy', { __httpCode: 422 });
  });

  it('should not allow to call with too short search string', async () => {
    const result = await performJSONRequest(
      'GET',
      '/v2/users/sparseMatches?qs=a',
      null,
      authHeaders(luna),
    );
    expect(result, 'to satisfy', { __httpCode: 422 });
  });

  it('should not allow to call with invalid search string', async () => {
    const result = await performJSONRequest(
      'GET',
      `/v2/users/sparseMatches?qs=${encodeURIComponent('$ %$#')}`,
      null,
      authHeaders(luna),
    );
    expect(result, 'to satisfy', { __httpCode: 422 });
  });

  it('should search with valid search string', async () => {
    const result = await performJSONRequest(
      'GET',
      `/v2/users/sparseMatches?qs=${encodeURIComponent('an')}`,
      null,
      authHeaders(luna),
    );
    expect(result, 'to satisfy', { __httpCode: 200 });
    expect(
      result.users.map(({ username }) => username),
      'when sorted',
      'to satisfy',
      ['uranus', 'antenna', 'saturn'].sort(),
    );
  });
});
