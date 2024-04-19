import { pick } from 'lodash';

import { dbAdapter, Comment } from '../../models';

import { serializeUsersByIds } from './user';

export async function serializeComment(comment, viewerId) {
  const comments = {
    ...pick(comment, ['id', 'shortId', 'body', 'createdAt', 'seqNumber']),
    createdBy: comment.userId,
  };

  const users = await serializeUsersByIds([comment.userId], viewerId);

  return { comments, users, admins: users };
}

export async function serializeCommentFull(comment, viewerId) {
  const res = await serializeCommentsFull([comment], viewerId);
  [res.comments] = res.comments;
  return res;
}

export async function serializeCommentsFull(comments, viewerId) {
  const commentIds = comments.map((c) => c.id);
  const [bansMap, likesInfo] = await Promise.all([
    dbAdapter.areCommentsBannedForViewerAssoc(commentIds, viewerId),
    dbAdapter.getLikesInfoForComments(commentIds, viewerId),
  ]);
  const userIds = new Set();

  const sComments = comments.map((comment) => {
    const ser = {
      ...pick(comment, [
        'id',
        'shortId',
        'body',
        'createdAt',
        'updatedAt',
        'seqNumber',
        'postId',
        'hideType',
      ]),
      createdBy: comment.userId,
    };

    if (
      bansMap[comment.id] === Comment.HIDDEN_AUTHOR_BANNED // ||
      // bansMap[comment.id] === Comment.HIDDEN_VIEWER_BANNED
    ) {
      ser.likes = 0;
      ser.hasOwnLike = false;

      ser.hideType = bansMap[comment.id];
      ser.body = Comment.hiddenBody(ser.hideType);
      ser.createdBy = null;
    } else {
      const commentLikesData = likesInfo.find((it) => it.uid === comment.id) ?? {
        c_likes: '0',
        has_own_like: false,
      };
      ser.likes = parseInt(commentLikesData.c_likes);
      ser.hasOwnLike = commentLikesData.has_own_like;
      userIds.add(comment.userId);

      if (bansMap[comment.id]) {
        ser._hideType = bansMap[comment.id];
      }
    }

    return ser;
  });

  const users = await serializeUsersByIds([...userIds], viewerId);
  return { comments: sComments, users, admins: users };
}
