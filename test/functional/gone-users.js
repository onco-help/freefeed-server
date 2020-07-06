/* eslint-env node, mocha */
/* global $database, $pg_database */
import expect from 'unexpected';

import { getSingleton } from '../../app/app';
import cleanDB from '../dbCleaner'
import { dbAdapter, AppTokenV1, PubSub } from '../../app/models';
import { PubSubAdapter } from '../../app/support/PubSubAdapter';
import { GONE_SUSPENDED } from '../../app/models/user';

import {
  createTestUsers,
  mutualSubscriptions,
  createAndReturnPost,
  performJSONRequest,
  authHeaders,
  like,
  createCommentAsync,
  likeComment,
  goPrivate,
  unsubscribeUserFromMeAsync,
  sendRequestToSubscribe,
  createGroupAsync,
  groupToPrivate,
  sendRequestToJoinGroup,
  unsubscribeFromAsync,
  subscribeToAsync,
  promoteToAdmin
} from './functional_test_helper';
import Session from './realtime-session';


describe('Gone users', () => {
  let port;

  before(async () => {
    const app = await getSingleton();
    port = process.env.PEPYATKA_SERVER_PORT || app.context.config.port;
    const pubsubAdapter = new PubSubAdapter($database)
    PubSub.setPublisher(pubsubAdapter)
  });

  beforeEach(() => cleanDB($pg_database));

  let luna, mars, post;
  beforeEach(async () => {
    [luna, mars] = await createTestUsers(['luna', 'mars']);
    await mutualSubscriptions([luna, mars]);
    // Luna writes a post
    post = await createAndReturnPost(luna, 'Luna post');
    // Luna is gone
    await dbAdapter.setUserGoneStatus(luna.user.id, GONE_SUSPENDED);
  });

  describe(`Gone user's timelines`, () => {
    it(`should return Luna's Posts feed to anonymous with 'private' luna and without posts`, async () => {
      const resp = await performJSONRequest('GET', `/v2/timelines/${luna.username}`);
      expect(resp, 'to satisfy', {
        timelines:     { posts: [], subscribers: [] },
        users:         [{ id: luna.user.id, isProtected: '1', isPrivate: '1', isGone: true }],
        subscriptions: [],
        subscribers:   [],
        posts:         [],
      });
    });

    it(`should return Luna's Posts feed to Mars with 'private' luna and without posts`, async () => {
      const resp = await performJSONRequest('GET', `/v2/timelines/${luna.username}`, null, authHeaders(mars));
      expect(resp, 'to satisfy', {
        timelines:     { posts: [], subscribers: [] },
        users:         [{ id: luna.user.id, isProtected: '1', isPrivate: '1', isGone: true }],
        subscriptions: [],
        subscribers:   [],
        posts:         [],
      });
    });

    it(`should return empty Luna's timeline metatags`, async () => {
      const resp = await performJSONRequest('GET', `/v2/timelines-metatags/${luna.username}`);
      expect(resp, 'to satisfy', { __httpCode: 200, textResponse: '' });
    });
  });

  describe(`Subscriptions`, () => {
    it(`should show Luna in Mars subscribers`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/${mars.username}/subscribers`);
      expect(resp, 'to satisfy', { subscribers: [{ id: luna.user.id }] });
    });

    it(`should allow Mars to unsubscribe Luna from themself`, async () => {
      const resp = await performJSONRequest('POST', `/v1/users/${luna.username}/unsubscribeFromMe`,
        null, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    it(`should allow Mars to unsubscribe from Luna`, async () => {
      const resp = await performJSONRequest('POST', `/v1/users/${luna.username}/unsubscribe`,
        null, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });

    describe(`Mars unsubscribed from Luna`, () => {
      beforeEach(() => performJSONRequest('POST', `/v1/users/${luna.username}/unsubscribe`,
        null, authHeaders(mars)));

      it(`should not allow Mars to subscribe to Luna again`, async () => {
        const resp = await performJSONRequest('POST', `/v1/users/${luna.username}/subscribe`,
          null, authHeaders(mars));
        expect(resp, 'to satisfy', { __httpCode: 403 });
      });

      it(`should not allow Mars to send subscription request to Luna`, async () => {
        const resp = await performJSONRequest('POST', `/v1/users/${luna.username}/sendRequest`,
          null, authHeaders(mars));
        expect(resp, 'to satisfy', { __httpCode: 403 });
      });
    });
  });

  describe(`Bans`, () => {
    it(`should allow Mars to ban Luna`, async () => {
      const resp = await performJSONRequest('POST', `/v1/users/${luna.username}/ban`,
        null, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });
    it(`should allow Mars to unban Luna`, async () => {
      await performJSONRequest('POST', `/v1/users/${luna.username}/ban`,
        null, authHeaders(mars));
      const resp = await performJSONRequest('POST', `/v1/users/${luna.username}/unban`,
        null, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 200 });
    });
  });

  describe(`Directs`, () => {
    it(`should return Luna's info to Mars with acceptsDirects = false`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/${luna.username}`,
        null, authHeaders(mars));
      expect(resp, 'to satisfy', { acceptsDirects: false });
    });

    it(`should not allow Mars to send direct message to Luna`, async () => {
      const resp = await performJSONRequest('POST', `/v1/posts`,
        {
          post: { body: 'Hello' },
          meta: { feeds: [luna.username] },
        }, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 403 });
    });
  });

  describe(`Auth tokens`, () => {
    it(`should not authorize Luna by session token`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/me`, null, authHeaders(luna));
      expect(resp, 'to satisfy', { __httpCode: 401 });
    });

    it(`should not authorize Luna by app token`, async () => {
      const token = new AppTokenV1({
        userId: luna.user.id,
        title:  `My token`,
        scopes: [],
      });
      await token.create();

      const resp = await performJSONRequest(
        'GET', `/v1/users/me`, null,
        { 'Authorization': `Bearer ${token.tokenString()}` }
      );
      expect(resp, 'to satisfy', { __httpCode: 401 });
    });

    describe(`Realtime`, () => {
      let lunaSession;

      beforeEach(async () => {
        lunaSession = await Session.create(port, 'Luna session')
      });

      afterEach(() => lunaSession.disconnect());

      it(`should not authorize Luna's realtime session`, async () => {
        const test = lunaSession.sendAsync('auth', { authToken: luna.authToken });
        await expect(test, 'to be rejected with', /not exists or is not active/);
      });
    });
  });

  describe('Posts', () => {
    it(`should not show Luna's post in Mars homefeed`, async () => {
      const resp = await performJSONRequest('GET', `/v2/timelines/home`, null, authHeaders(mars));
      expect(resp, 'to satisfy', { timelines: { posts: [] }, posts: [] });
    });

    it(`should not show Luna's post in everything feed`, async () => {
      const resp = await performJSONRequest('GET', `/v2/everything`);
      expect(resp, 'to satisfy', { posts: [] });
    });

    it(`should not show Luna's post in global summary feed`, async () => {
      const resp = await performJSONRequest('GET', `/v2/summary/1`, null, authHeaders(mars));
      expect(resp, 'to satisfy', { posts: [] });
    });

    it(`should not show Luna's post by direct link to anonymous`, async () => {
      const resp = await performJSONRequest('GET', `/v2/posts/${post.id}`);
      expect(resp, 'to satisfy', { __httpCode: 404 });
    });

    it(`should not show Luna's post by direct link to Mars`, async () => {
      const resp = await performJSONRequest('GET', `/v2/posts/${post.id}`, null, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 404 });
    });

    it(`should not allow Mars to comment Luna's post`, async () => {
      const resp = await performJSONRequest('POST', `/v1/comments`,
        { comment: { body: 'Hello', postId: post.id } }, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 404 });
    });

    it(`should not allow Mars to like Luna's post`, async () => {
      const resp = await performJSONRequest('POST', `/v1/posts/${post.id}/like`, null, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 404 });
    });

    it(`should not allow Mars to hide Luna's post`, async () => {
      const resp = await performJSONRequest('POST', `/v1/posts/${post.id}/hide`, null, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 404 });
    });

    it(`should not show opengraph of Luna's post`, async () => {
      const resp = await performJSONRequest('GET', `/v2/posts-opengraph/${post.id}`);
      expect(resp, 'to satisfy', { textResponse: '' });
    });

    it(`should not show Luna's post in search results`, async () => {
      const resp = await performJSONRequest('GET', `/v2/search?qs=from:${luna.username}`);
      expect(resp, 'to satisfy', { posts: [] });
    });
  });

  describe(`Session`, () => {
    it(`should not allow Luna to start session`, async () => {
      const resp = await performJSONRequest('POST', `/v1/session`, { username: 'luna', password: 'pw' });
      expect(resp, 'to satisfy', { __httpCode: 401 });
    });
  });

  describe(`Likes`, () => {
    let marsPost, marsComment;
    beforeEach(async () => {
      marsPost = await createAndReturnPost(mars, 'Mars post');
      marsComment = (await createCommentAsync(mars, marsPost.id, 'Comment').then((r) => r.json())).comments;
      await dbAdapter.setUserGoneStatus(luna.user.id, null);
      await like(marsPost.id, luna.authToken);
      await likeComment(marsComment.id, luna);
      await dbAdapter.setUserGoneStatus(luna.user.id, GONE_SUSPENDED);
    });

    it(`should not show Luna's like to Mars post`, async () => {
      const resp = await performJSONRequest('GET', `/v2/posts/${marsPost.id}`);
      expect(resp, 'to satisfy', { posts: { likes: [] } });
    });

    it(`should not show Luna's like to Mars comment`, async () => {
      const resp = await performJSONRequest('GET', `/v2/comments/${marsComment.id}/likes`);
      expect(resp, 'to satisfy', { likes: [] });
    });

    it(`should not show Luna's comment like in post response`, async () => {
      const resp = await performJSONRequest('GET', `/v2/posts/${marsPost.id}`);
      expect(resp, 'to satisfy', { comments: [{ likes: 0 }] });
    });

    it(`should not show Luna's likes in Luna's statistics`, async () => {
      const resp = await performJSONRequest('GET', `/v1/users/${luna.username}`);
      expect(resp, 'to satisfy', {
        users: {
          statistics: {
            posts:         '0',
            likes:         '0',
            comments:      '0',
            subscribers:   '0',
            subscriptions: '0',
          }
        }
      });
    });
  });

  describe(`Requests`, () => {
    describe(`Mars is private, Luna sent request and gone`, () => {
      beforeEach(async () => {
        await dbAdapter.setUserGoneStatus(luna.user.id, null);
        await goPrivate(mars);
        await unsubscribeUserFromMeAsync(mars, luna);
        await sendRequestToSubscribe(luna, mars);
        await dbAdapter.setUserGoneStatus(luna.user.id, GONE_SUSPENDED);
      });

      it(`should not show Luna's request in Mars whoami`, async () => {
        const resp = await performJSONRequest('GET', `/v2/users/whoami`, null, authHeaders(mars));
        expect(resp, 'to satisfy', { users: { subscriptionRequests: [] }, requests: [] });
      });
    });

    describe(`Mars have private group, Luna sent request and gone`, () => {
      beforeEach(async () => {
        await dbAdapter.setUserGoneStatus(luna.user.id, null);
        const selenites = await createGroupAsync(mars, 'selenites');
        await groupToPrivate(selenites.group, mars);
        await unsubscribeFromAsync(luna, mars);
        await sendRequestToJoinGroup(luna, selenites);
        await dbAdapter.setUserGoneStatus(luna.user.id, GONE_SUSPENDED);
      });

      it(`should not show Luna's request in Mars whoami`, async () => {
        const resp = await performJSONRequest('GET', `/v2/users/whoami`, null, authHeaders(mars));
        expect(resp, 'to satisfy', {
          users:         { pendingGroupRequests: false },
          managedGroups: [{ requests: [] }]
        });
      });
    });
  });

  describe(`Group Administration`, () => {
    let selenites;
    beforeEach(async () => {
      await dbAdapter.setUserGoneStatus(luna.user.id, null);
      selenites = await createGroupAsync(mars, 'selenites');
      await subscribeToAsync(luna, selenites);
      await dbAdapter.setUserGoneStatus(luna.user.id, GONE_SUSPENDED);
    });

    it(`should not allow Mars to promote Luna to admin`, async () => {
      const resp = await performJSONRequest(
        'POST', `/v1/groups/${selenites.username}/subscribers/${luna.username}/admin`,
        null, authHeaders(mars));
      expect(resp, 'to satisfy', { __httpCode: 403 });
    });

    describe(`Luna and Mars are group admins`, () => {
      beforeEach(async () => {
        await dbAdapter.setUserGoneStatus(luna.user.id, null);
        await promoteToAdmin(selenites, mars, luna);
        await dbAdapter.setUserGoneStatus(luna.user.id, GONE_SUSPENDED);
      });

      it(`should not allow Mars to unadmin themself`, async () => {
        const resp = await performJSONRequest(
          'POST', `/v1/groups/${selenites.username}/subscribers/${mars.username}/unadmin`,
          null, authHeaders(mars));
        expect(resp, 'to satisfy', { __httpCode: 403 });
      });
    });
  });
});
