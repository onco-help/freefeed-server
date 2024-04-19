/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected';

import cleanDB from '../../../dbCleaner';
import { User, Post, dbAdapter, Comment } from '../../../../app/models';

describe('Unread directs counter', () => {
  let luna, mars, venus;

  before(async () => {
    await cleanDB($pg_database);

    luna = new User({ username: 'luna', password: 'pw' });
    mars = new User({ username: 'mars', password: 'pw' });
    venus = new User({ username: 'venus', password: 'pw' });
    await Promise.all([luna.create(), mars.create(), venus.create()]);
  });

  async function getCounters() {
    return Object.fromEntries(
      await Promise.all(
        [luna, mars, venus].map(async (u) => [
          u.username,
          await dbAdapter.getUnreadDirectsNumber(u.id),
        ]),
      ),
    );
  }

  function countersShouldEqual(expected) {
    it(`counters should equal ${JSON.stringify(expected)}`, async () => {
      const counters = await getCounters();
      expect(counters, 'to equal', expected);
    });
  }

  // Drop counters after each test
  afterEach(() =>
    Promise.all([luna, mars, venus].map((u) => dbAdapter.markAllDirectsAsRead(u.id))),
  );

  describe('Luna wrote direct message to Mars and Venus', () => {
    let post;
    before(async () => {
      const [lunaFeed, marsFeed, venusFeed] = await Promise.all([
        luna.getDirectsTimeline(),
        mars.getDirectsTimeline(),
        venus.getDirectsTimeline(),
      ]);

      post = new Post({
        body: `Hi!`,
        userId: luna.id,
        timelineIds: [lunaFeed.id, marsFeed.id, venusFeed.id],
      });
      await post.create();
    });

    countersShouldEqual({ luna: 0, mars: 1, venus: 1 });
    countersShouldEqual({ luna: 0, mars: 0, venus: 0 });

    describe('Mars commenting the message', () => {
      before(() =>
        new Comment({
          body: `Comment`,
          userId: mars.id,
          postId: post.id,
        }).create(),
      );

      countersShouldEqual({ luna: 1, mars: 0, venus: 1 });

      describe('Venus bans Mars for a while, Mars commenting the message', () => {
        before(() => venus.ban(mars.username));
        before(() =>
          new Comment({
            body: `Comment`,
            userId: mars.id,
            postId: post.id,
          }).create(),
        );
        after(() => venus.unban(mars.username));

        countersShouldEqual({ luna: 1, mars: 0, venus: 0 });
      });

      describe('Luna bans Mars for a while, Luna commenting the messages', () => {
        before(() => luna.ban(mars.username));
        before(() =>
          new Comment({
            body: `Comment`,
            userId: luna.id,
            postId: post.id,
          }).create(),
        );
        after(() => luna.unban(mars.username));

        countersShouldEqual({ luna: 0, mars: 0, venus: 1 });
      });
    });
  });
});
