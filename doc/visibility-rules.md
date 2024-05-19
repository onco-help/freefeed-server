# Content visibility rules

This document describes an algorithm that determines whether a given user
(*viewer*) can see a particular content: post, comment, like, comment like.

## Posts

Post is not visible to anyone when its author is in any *gone status*.

### Anonymous viewer

Anonymous viewer can see all (and only) public posts.

### Logged-in viewer

Logged-in viewer can see post when two conditions are true: the privacy
condition AND the bans condition.

The privacy condition: post is not private OR viewer is subscribed to any of
post destination feeds.

The bans condition (AND-joined):
* Post author is not banned by the viewer OR post is published to a group where
  the viewer had disabled bans.
* Viewer is not banned by the post author OR post is published to a group where
  the viewer *is admin* and had disabled bans.

### In code
The post visibility rules calculates in the following places:
* app/support/DbAdapter/visibility.js, postsVisibilitySQL function. This
  function makes SQL filter to select only visible posts.
* app/support/DbAdapter/visibility.js, getUsersWhoCanSeePost function. This
  function returns list of users (IDs) who can see the given post.

## Comments, Likes and Comment likes

Comments, Likes and Comment likes (hereinafter "actions") shares the same logic.

Actions on the given post is not visible for viewer if the post is not visible.

Action is invisible when the action author is banned by viewer or the viewer is
banned by the action author, with the following exceptions:

* When *the action author is banned* by viewer, action is visible when:
  * The post is published to a group where the viewer had disabled bans.
* When *the viewer is banned* by the action author, action is visible when
  (OR-joined):
  * The post is published to a group where the viewer *is admin* and had
    disabled bans;
  * The post is authored by the viewer.

If the post is visible but the comment is not, the comment may appear as a stub
(with 'hideType' field value of HIDDEN_AUTHOR_BANNED or HIDDEN_VIEWER_BANNED).
It depends on *hideCommentsOfTypes* field of viewer properties.

Handling the visibility of comments is a bit special (see the
'commentAccessRequired' middleware). If the viewer has access to post, but not
to comment, the middleware acts as follows:
* If the comment itself is requested, the comment is returned, but with the
  appropriate hideType and with a placeholder instead of the body.
* If the comment-related resource is requested (currently it is a comment like),
  the middleware throws a 403 error.

Also, the viewer can "unlock" the comment using the "unlock-banned" URL
parameter (`GET /v2/comments/:commentId?unlock-banned`). This parameter removes
the HIDDEN_AUTHOR_BANNED hide type from comment and allows the comment to be
viewed (if it is not HIDDEN_VIEWER_BANNED).

### In code
The action visibility rules calculates in the following places:
* app/support/DbAdapter/visibility.js, bannedActionsSQLsFabric and
  notBannedActionsSQLFabric functions. This functions makes SQL filter fabrics
  to select (non-)banned actions.
* app/support/DbAdapter/visibility.js, getUsersWhoCanSeeComment function. This
  function returns list of users (IDs) who can see the given comment.
* app/support/DbAdapter/visibility.js, isCommentBannedForViewer and
  areCommentsBannedForViewerAssoc functions. This functions checks if comment(s)
  is/are banned (and should be hidden) for the given viewer.
* app/pubsub-listener.js, broadcastMessage function checks access for actions.
* app/controllers/middlewares/comment-access-required.js, the
  'commentAccessRequired' middleware.