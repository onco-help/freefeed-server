///////////////////////////////////////////////////
// Unread directs counter
///////////////////////////////////////////////////

const unreadDirectsTrait = (superClass) =>
  class extends superClass {
    markAllDirectsAsRead(userId) {
      return this.database.raw(`update users set directs_read_at = now() where uid = :userId`, {
        userId,
      });
    }

    async getUnreadDirectsNumber(userId) {
      const [directsFeed, directsReadAt, postsPrivacySQL, commentsPrivacySQLFabric] =
        await Promise.all([
          this.getUserNamedFeed(userId, 'Directs'),
          this.database.getOne(`select directs_read_at from users where uid = :userId`, { userId }),
          this.postsVisibilitySQL(userId),
          this.notBannedActionsSQLFabric(userId),
        ]);

      /**
       * The number of unread directs is the number of visible direct posts,
       * which are:
       * 1. Created after the 'directsReadAt' by the other user, or
       * 2. Have visible comments, created after the 'directsReadAt' by the
       *    other user.
       */
      return this.database.getOne(
        `with direct_posts as (
          select p.* from
            posts p
            join users u on p.user_id = u.uid
          where
            p.destination_feed_ids && array[:directsFeedIntId]::integer[]
            and ${postsPrivacySQL}
        )
        select count(distinct unread.id)::integer from (
          select id from direct_posts 
            where 
              user_id <> :userId
              and created_at > :directsReadAt
          union
          select p.id from
            comments c
            join direct_posts p on p.uid = c.post_id
            where
              c.user_id != :userId
              and c.created_at > :directsReadAt
              and ${commentsPrivacySQLFabric('c')}
        ) as unread`,
        {
          directsFeedIntId: directsFeed.intId,
          userId,
          directsReadAt,
        },
      );
    }
  };

export default unreadDirectsTrait;
