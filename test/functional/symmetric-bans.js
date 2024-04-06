/* eslint-env node, mocha */

import expect from 'unexpected';

import { dbAdapter, Comment } from '../../app/models';
import cleanDB from '../dbCleaner';

import {
  banUser,
  createCommentAsync,
  createAndReturnPost,
  createTestUsers,
  performJSONRequest,
  authHeaders,
  updateUserAsync,
} from './functional_test_helper';

describe('Symmetric bans', () => {
  beforeEach(() => cleanDB(dbAdapter.database));
  describe('Comments visibility', () => {
    describe('Luna bans Mars, both commented the Venus post', () => {
      let luna;
      let mars;
      let venus;
      let post;
      beforeEach(async () => {
        [luna, mars, venus] = await createTestUsers(['luna', 'mars', 'venus']);
        post = await createAndReturnPost(venus, 'Post body');
        await banUser(luna, mars);
        await createCommentAsync(luna, post.id, 'Comment from Luna');
        await createCommentAsync(mars, post.id, 'Comment from Mars');
      });

      it('should show all comments to Venus', async () => {
        const resp = await fetchPost(post.id, venus);
        expect(resp.comments, 'to satisfy', [
          { body: 'Comment from Luna', createdBy: luna.user.id },
          { body: 'Comment from Mars', createdBy: mars.user.id },
        ]);
      });

      it(`should not show Mars' comments to Luna`, async () => {
        const resp = await fetchPost(post.id, luna);
        expect(resp.comments, 'to satisfy', [
          { body: 'Comment from Luna', createdBy: luna.user.id },
        ]);
      });

      it(`should not show Luna's comments to Mars`, async () => {
        const resp = await fetchPost(post.id, mars);
        expect(resp.comments, 'to satisfy', [
          { body: 'Comment from Mars', createdBy: mars.user.id },
        ]);
      });

      describe('Luna and Mars wants to see all hidden comments', () => {
        beforeEach(() =>
          Promise.all([
            updateUserAsync(luna, { preferences: { hideCommentsOfTypes: [] } }),
            updateUserAsync(mars, { preferences: { hideCommentsOfTypes: [] } }),
          ]),
        );

        it(`should show Mars' comments to Luna as placeholder`, async () => {
          const resp = await fetchPost(post.id, luna);
          expect(resp.comments, 'to satisfy', [
            { body: 'Comment from Luna', createdBy: luna.user.id },
            {
              body: Comment.hiddenBody(Comment.HIDDEN_AUTHOR_BANNED),
              createdBy: null,
              hideType: Comment.HIDDEN_AUTHOR_BANNED,
            },
          ]);
        });

        it(`should show Luna's comments to Mars as placeholder`, async () => {
          const resp = await fetchPost(post.id, mars);
          expect(resp.comments, 'to satisfy', [
            {
              body: Comment.hiddenBody(Comment.HIDDEN_VIEWER_BANNED),
              createdBy: null,
              hideType: Comment.HIDDEN_VIEWER_BANNED,
            },
            { body: 'Comment from Mars', createdBy: mars.user.id },
          ]);
        });
      });

      describe('Luna and Mars wants to see all comments except of HIDDEN_AUTHOR_BANNED', () => {
        beforeEach(() =>
          Promise.all([
            updateUserAsync(luna, {
              preferences: { hideCommentsOfTypes: [Comment.HIDDEN_AUTHOR_BANNED] },
            }),
            updateUserAsync(mars, {
              preferences: { hideCommentsOfTypes: [Comment.HIDDEN_AUTHOR_BANNED] },
            }),
          ]),
        );

        it(`should not show Mars' comments to Luna`, async () => {
          const resp = await fetchPost(post.id, luna);
          expect(resp.comments, 'to satisfy', [
            { body: 'Comment from Luna', createdBy: luna.user.id },
          ]);
        });

        it(`should show Luna's comments to Mars as placeholder`, async () => {
          const resp = await fetchPost(post.id, mars);
          expect(resp.comments, 'to satisfy', [
            {
              body: Comment.hiddenBody(Comment.HIDDEN_VIEWER_BANNED),
              createdBy: null,
              hideType: Comment.HIDDEN_VIEWER_BANNED,
            },
            { body: 'Comment from Mars', createdBy: mars.user.id },
          ]);
        });
      });

      describe('Luna and Mars wants to see all comments except of HIDDEN_VIEWER_BANNED', () => {
        beforeEach(() =>
          Promise.all([
            updateUserAsync(luna, {
              preferences: { hideCommentsOfTypes: [Comment.HIDDEN_VIEWER_BANNED] },
            }),
            updateUserAsync(mars, {
              preferences: { hideCommentsOfTypes: [Comment.HIDDEN_VIEWER_BANNED] },
            }),
          ]),
        );

        it(`should show Mars' comments to Luna as placeholder`, async () => {
          const resp = await fetchPost(post.id, luna);
          expect(resp.comments, 'to satisfy', [
            { body: 'Comment from Luna', createdBy: luna.user.id },
            {
              body: Comment.hiddenBody(Comment.HIDDEN_AUTHOR_BANNED),
              createdBy: null,
              hideType: Comment.HIDDEN_AUTHOR_BANNED,
            },
          ]);
        });

        it(`should not show Luna's comments to Mars`, async () => {
          const resp = await fetchPost(post.id, mars);
          expect(resp.comments, 'to satisfy', [
            { body: 'Comment from Mars', createdBy: mars.user.id },
          ]);
        });
      });
    });
  });
});

function fetchPost(postId, userCtx) {
  return performJSONRequest('GET', `/v2/posts/${postId}`, null, authHeaders(userCtx));
}
