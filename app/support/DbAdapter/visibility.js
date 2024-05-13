import pgFormat from 'pg-format';
import { intersection } from 'lodash';

import { List } from '../open-lists';
import { Comment } from '../../models';

import { andJoin, orJoin, sqlIn, sqlIntarrayIn, sqlNot, sqlNotIn } from './utils';

const visibilityTrait = (superClass) =>
  class extends superClass {
    /**
     * A general SQL that filters posts using bans and privates visibility rules.
     *
     * See doc/visibility-rules.md for the rules details.
     */
    async postsVisibilitySQL(viewerId = null, { postsTable = 'p', postAuthorsTable = 'u' } = {}) {
      if (!viewerId) {
        return andJoin([
          `${postAuthorsTable}.gone_status is null`,
          `not ${postsTable}.is_protected`,
        ]);
      }

      const [
        // Private feeds viewer can read
        visiblePrivateFeedIntIds,
        groupsWithDisabledBans,
        managedGroups,
        // Users banned by viewer
        bannedByViewer,
        // Users who banned viewer
        viewerBannedBy,
      ] = await Promise.all([
        this.getVisiblePrivateFeedIntIds(viewerId),
        this.getGroupsWithDisabledBans(viewerId),
        this.getManagedGroupIds(viewerId),
        this.getUserBansIds(viewerId),
        this.getUserIdsWhoBannedUser(viewerId),
      ]);

      const managedGroupsWithDisabledBans = intersection(managedGroups, groupsWithDisabledBans);

      const [feedsOfGroupsWithDisabledBans, feedsOfManagedGroupsWithDisabledBans] =
        await Promise.all([
          this.getUsersNamedFeedsIntIds(groupsWithDisabledBans, ['Posts']),
          this.getUsersNamedFeedsIntIds(managedGroupsWithDisabledBans, ['Posts']),
        ]);

      const bansSQL = andJoin([
        // 1. Viewer should see posts of banned users in feedsWithDisabledBans
        orJoin([
          sqlNotIn('p.user_id', bannedByViewer),
          sqlIntarrayIn('p.destination_feed_ids', feedsOfGroupsWithDisabledBans),
        ]),
        // 2. Viewer should see posts of users banned him in feedsOfManagedGroupsWithDisabledBans
        orJoin([
          sqlNotIn('p.user_id', viewerBannedBy),
          sqlIntarrayIn('p.destination_feed_ids', feedsOfManagedGroupsWithDisabledBans),
        ]),
      ]);

      return andJoin([
        // Privacy
        viewerId
          ? orJoin([
              'not p.is_private',
              sqlIntarrayIn('p.destination_feed_ids', visiblePrivateFeedIntIds),
            ])
          : 'not p.is_protected',
        // Bans
        bansSQL,
        // Gone post's authors
        'u.gone_status is null',
      ]);
    }

    /**
     * A fabric of SQL that filters comments, likes and other actions using bans
     * and privates visibility rules.
     *
     * See doc/visibility-rules.md for the rules details.
     */
    async notBannedActionsSQLFabric(viewerId = null) {
      const fabric2 = await this.bannedActionsSQLsFabric(viewerId);
      return (actionsTable, postsTable = 'p', useIntBanIds = false) =>
        sqlNot(orJoin(fabric2(actionsTable, postsTable, useIntBanIds)));
    }

    /**
     * This function creates a fabric that returns array of _two_ SQL
     * sub-queries:
     * 1. For actions that are invisible because the author of the action is
     *    banned by the viewer, and
     * 2. For actions that are invisible because the viewer is banned by the
     *    author of the action.
     *
     * See doc/visibility-rules.md for the rules details.
     */
    async bannedActionsSQLsFabric(viewerId = null) {
      if (!viewerId) {
        return () => ['false', 'false'];
      }

      const [
        groupsWithDisabledBans,
        managedGroups,
        // Users banned by viewer
        bannedByViewer,
        // Users who banned viewer
        viewerBannedBy,
      ] = await Promise.all([
        this.getGroupsWithDisabledBans(viewerId),
        this.getManagedGroupIds(viewerId),
        this.database.getAll(
          `select u.id, u.uid from
            bans b join users u on banned_user_id = u.uid
            where b.user_id = :viewerId`,
          { viewerId },
        ),
        this.database.getAll(
          `select u.id, u.uid from
            bans b join users u on user_id = u.uid
            where b.banned_user_id = :viewerId`,
          { viewerId },
        ),
      ]);

      const managedGroupsWithDisabledBans = intersection(managedGroups, groupsWithDisabledBans);

      const [feedsOfGroupsWithDisabledBans, feedsOfManagedGroupsWithDisabledBans] =
        await Promise.all([
          this.getUsersNamedFeedsIntIds(groupsWithDisabledBans, ['Posts']),
          this.getUsersNamedFeedsIntIds(managedGroupsWithDisabledBans, ['Posts']),
        ]);

      return (actionsTable, postsTable = 'p', useIntBanIds = false) => [
        // 1. Actions that are invisible because the author of the action is banned by the viewer
        andJoin([
          // The author of action is banned by the viewer
          sqlIn(
            `${actionsTable}.user_id`,
            bannedByViewer.map((r) => r[useIntBanIds ? 'id' : 'uid']),
          ),
          // And the post is not in some group with bans disabled
          sqlNot(
            sqlIntarrayIn(`${postsTable}.destination_feed_ids`, feedsOfGroupsWithDisabledBans),
          ),
        ]),
        // 2. Actions that are invisible because the viewer is banned by the author of the action
        andJoin([
          // The viewer is banned by the author of the action
          sqlIn(
            `${actionsTable}.user_id`,
            viewerBannedBy.map((r) => r[useIntBanIds ? 'id' : 'uid']),
          ),
          // And the post is not in some group, managed by viewer, with bans disabled
          sqlNot(
            sqlIntarrayIn(
              `${postsTable}.destination_feed_ids`,
              feedsOfManagedGroupsWithDisabledBans,
            ),
          ),
          // And the post is not authored by the viewer
          pgFormat(`${postsTable}.user_id <> %L`, viewerId),
        ]),
      ];
    }

    async isPostVisibleForViewer(postId, viewerId = null) {
      const visibilitySQL = await this.postsVisibilitySQL(viewerId);
      return await this.database.getOne(
        `select exists(
            select 1 from 
              posts p join users u on p.user_id = u.uid
              where p.uid = :postId and ${visibilitySQL}
          )`,
        { postId },
      );
    }

    async isCommentBannedForViewer(commentId, viewerId = null) {
      const m = await this.areCommentsBannedForViewerAssoc([commentId], viewerId);
      return m.get(commentId) ?? null;
    }

    async areCommentsBannedForViewerAssoc(commentIds, viewerId = null) {
      const bannedSQLsFabric = await this.bannedActionsSQLsFabric(viewerId);
      const [bannedByViewerSQL, bannedByAuthorSQL] = bannedSQLsFabric('c');
      const rows = await this.database.getAll(
        `select
            c.uid,
            ${bannedByViewerSQL} as banned_by_viewer,
            ${bannedByAuthorSQL} as banned_by_author
         from comments c
            join posts p on p.uid = c.post_id
            where c.uid = any(:commentIds)
          `,
        { commentIds },
      );
      const result = new Map();

      for (const row of rows) {
        const s = [];

        if (row.banned_by_viewer) {
          // Always first, when present
          s.push(Comment.HIDDEN_AUTHOR_BANNED);
        }

        if (row.banned_by_author) {
          s.push(Comment.HIDDEN_VIEWER_BANNED);
        }

        if (s.length > 0) {
          result.set(row.uid, s);
        }
      }

      return result;
    }

    /**
     * List (as in support/open-lists) of users that can see the given post.
     * This method doesn't received postId because it can be called after the
     * actual post deletion, but with saved post properties.
     *
     * See doc/visibility-rules.md for the visibility rules.
     */
    async getUsersWhoCanSeePost({ authorId, destFeeds }) {
      if (
        await this.database.getOne(
          'select gone_status is not null from users where uid = :authorId',
          { authorId },
        )
      ) {
        return List.empty();
      }

      const groups = await this.database.getCol(
        `select u.uid
          from users u join feeds f on f.user_id = u.uid and f.name = 'Posts'
          where u.type = 'group' and f.id = any(:destFeeds)`,
        { destFeeds },
      );

      const [
        // Users banned by author
        bannedByAuthor,
        // Users who banned author
        authorBannedBy,
        usersDisabledBans,
        privacyAllowed,
      ] = await Promise.all([
        this.getUserBansIds(authorId),
        this.getUserIdsWhoBannedUser(authorId),
        this.getUsersWithDisabledBansInGroups(groups),
        this.getUsersWhoCanSeeFeeds(destFeeds),
      ]);

      // Users who choose to see banned posts in any of post group
      const allWhoDisabledBans = usersDisabledBans.map((r) => r.user_id);
      // Users who are admins of any post group and choose to see banned posts in it
      const adminsWhoDisabledBans = usersDisabledBans
        .filter((r) => r.is_admin)
        .map((r) => r.user_id);

      return List.difference(
        privacyAllowed,
        // Except banned
        List.union(
          List.difference(authorBannedBy, allWhoDisabledBans),
          List.difference(bannedByAuthor, adminsWhoDisabledBans),
        ),
      );
    }

    /**
     * List (as in support/open-lists) of users that can see the given comment.
     * This method doesn't received commentId because it can be called after the
     * actual comment deletion, but with saved comment properties.
     *
     * See doc/visibility-rules.md for the visibility rules.
     */
    async getUsersWhoCanSeeComment({ postId, authorId: commentAuthor }) {
      const { user_id: postAuthor, destination_feed_ids: postDestFeeds } =
        await this.database.getRow(
          `select
            user_id, destination_feed_ids
          from posts
            where uid = :postId`,
          { postId },
        );

      const postViewers = await this.getUsersWhoCanSeePost({
        authorId: postAuthor,
        destFeeds: postDestFeeds,
      });

      const postGroups = await this.database.getCol(
        `select u.uid
          from users u join feeds f on f.user_id = u.uid and f.name = 'Posts'
          where u.type = 'group' and f.id = any(:postDestFeeds)`,
        { postDestFeeds },
      );

      const [
        // Users banned by comment author
        bannedByAuthor,
        // Users who banned comment author
        authorBannedBy,
        usersDisabledBans,
      ] = await Promise.all([
        this.getUserBansIds(commentAuthor),
        this.getUserIdsWhoBannedUser(commentAuthor),
        this.getUsersWithDisabledBansInGroups(postGroups),
      ]);

      // Users who choose to see banned posts in any of post group
      const allWhoDisabledBans = usersDisabledBans.map((r) => r.user_id);
      // Users who are admins of any post group and choose to see banned posts in it
      const adminsWhoDisabledBans = usersDisabledBans
        .filter((r) => r.is_admin)
        .map((r) => r.user_id);

      return List.intersection(
        postViewers,
        // List.inverse(List.difference(authorBannedBy, allWhoDisabledBans)),
        List.inverse(
          List.union(
            // All who banned comment author, except those who disabled bans
            List.difference(authorBannedBy, allWhoDisabledBans),
            // All banned by comment author, except ADMINS who disabled bans and
            // the post author
            List.difference(bannedByAuthor, List.union(adminsWhoDisabledBans, [postAuthor])),
          ),
        ),
      );
    }

    /**
     * Return post ids (from postIds) visible by the given user. The order of
     * ids is preserved.
     * @param {string[]} postIds
     * @param {string} userId
     * @return {Promise<string[]>}
     */
    async selectPostsVisibleByUser(postIds, viewerId = null) {
      const restrictionsSQL = await this.postsVisibilitySQL(viewerId);
      return this.database.getCol(
        `select p.uid from
              unnest(:postIds::uuid[]) with ordinality as src (uid, ord)
              join posts p on src.uid = p.uid
              join users u on p.user_id = u.uid
            where ${restrictionsSQL} order by src.ord`,
        { postIds },
      );
    }
  };

export default visibilityTrait;
