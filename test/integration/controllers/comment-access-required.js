/* eslint-env node, mocha */
/* global $pg_database */
import { noop } from 'lodash';
import expect from 'unexpected';

import { commentAccessRequired } from '../../../app/controllers/middlewares';
import cleanDB from '../../dbCleaner';
import { User, Post, Group, Comment } from '../../../app/models';
import { ForbiddenException } from '../../../app/support/exceptions';

describe('commentAccessRequired', () => {
  beforeEach(() => cleanDB($pg_database));

  describe('Luna created post in Selenites group, Mars wrote comment', () => {
    let /** @type {User} */
      luna,
      /** @type {User} */
      mars,
      /** @type {User} */
      venus,
      /** @type {Group} */
      selenites;
    let /** @type {Post} */ post,
      /** @type {Comment} */ marsComment,
      /** @type {Comment} */ venusComment;

    beforeEach(async () => {
      luna = new User({ username: 'Luna', password: 'password' });
      mars = new User({ username: 'Mars', password: 'password' });
      venus = new User({ username: 'Venus', password: 'password' });
      await Promise.all([luna.create(), mars.create(), venus.create()]);
      selenites = new Group({ username: 'selenites' });
      await selenites.create(luna.id);

      post = new Post({
        body: 'Post body',
        userId: luna.id,
        timelineIds: [await selenites.getPostsTimelineId()],
      });
      await post.create();

      marsComment = new Comment({
        body: 'Comment body',
        userId: mars.id,
        postId: post.id,
      });
      await marsComment.create();
      venusComment = new Comment({
        body: 'Comment body',
        userId: venus.id,
        postId: post.id,
      });
      await venusComment.create();
    });

    it(`should show comment to anonymous`, async () => {
      const ctx = await checkCommentAccess(marsComment.id, null);
      expect(ctx.state, 'to satisfy', {
        post: {
          id: post.id,
        },
        comment: {
          id: marsComment.id,
          body: marsComment.body,
        },
      });
    });

    it(`should show comment to Venus`, async () => {
      await expect(checkCommentAccess(marsComment.id, venus), 'to be fulfilled');
    });

    // commentAccessRequired includes postAccessRequired, so we will check only
    // 'extra' ban logic here
    describe('Venus banned Mars', () => {
      beforeEach(() => venus.ban(mars.username));

      it(`should not show comment to Venus`, async () => {
        await expect(
          checkCommentAccess(marsComment.id, venus),
          'to be rejected with',
          new ForbiddenException('You have banned the author of this comment'),
        );
      });

      it(`should show comment with placeholder to Venus`, async () => {
        const ctx = await checkCommentAccess(marsComment.id, venus, false);
        expect(ctx.state, 'to satisfy', {
          comment: {
            id: marsComment.id,
            body: Comment.hiddenBody(Comment.HIDDEN_AUTHOR_BANNED),
            hideType: Comment.HIDDEN_AUTHOR_BANNED,
          },
        });
      });

      it(`should show comment with placeholder to Mars`, async () => {
        const ctx = await checkCommentAccess(venusComment.id, mars, false);
        expect(ctx.state, 'to satisfy', {
          comment: {
            id: venusComment.id,
            body: Comment.hiddenBody(Comment.HIDDEN_VIEWER_BANNED),
            hideType: Comment.HIDDEN_VIEWER_BANNED,
          },
        });
      });

      describe('Venus turns off bans in Selenites', () => {
        beforeEach(() => selenites.disableBansFor(venus.id));

        it(`should show comment to Venus`, async () => {
          await expect(checkCommentAccess(marsComment.id, venus), 'to be fulfilled');
        });
      });
    });
  });
});

async function checkCommentAccess(commentId, user, mustBeVisible = true) {
  const ctx = { params: { commentId }, state: { user } };
  await commentAccessRequired({ mustBeVisible })(ctx, noop);
  return ctx;
}
