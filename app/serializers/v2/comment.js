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

export async function serializeCommentFull(
  comment,
  viewerId,
  { unlockBannedComments = false } = {},
) {
  const res = await serializeCommentsFull([comment], viewerId, { unlockBannedComments });
  [res.comments] = res.comments;
  return res;
}

export async function serializeCommentsFull(
  comments,
  viewerId,
  { unlockBannedComments = false } = {},
) {
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
      likes: 0,
      hasOwnLike: false,
    };

    const banTypes = bansMap.get(comment.id);

    if (banTypes) {
      const filteredTypes = unlockBannedComments
        ? banTypes.filter((t) => t !== Comment.HIDDEN_AUTHOR_BANNED)
        : banTypes;

      const [hideType] = filteredTypes;

      if (hideType) {
        ser.hideType = hideType;
        ser.body = Comment.hiddenBody(ser.hideType);
        ser.createdBy = null;
      }
    }

    // Fill likes only for the truly visible comments
    if (!banTypes) {
      const commentLikesData = likesInfo.find((it) => it.uid === comment.id) ?? {
        c_likes: '0',
        has_own_like: false,
      };
      ser.likes = parseInt(commentLikesData.c_likes);
      ser.hasOwnLike = commentLikesData.has_own_like;
    }

    ser.createdBy && userIds.add(ser.createdBy);

    return ser;
  });

  const users = await serializeUsersByIds([...userIds], viewerId);
  return { comments: sComments, users, admins: users };
}
