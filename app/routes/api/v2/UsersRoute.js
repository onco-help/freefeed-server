import { UsersControllerV2 } from '../../../controllers';

export default function addRoutes(app) {
  app.get('/users/blockedByMe', UsersControllerV2.blockedByMe);
  app.get('/users/getUnreadDirectsNumber', UsersControllerV2.getUnreadDirectsNumber);
  app.get('/users/getUnreadNotificationsNumber', UsersControllerV2.getUnreadNotificationsNumber);
  app.get('/users/markAllDirectsAsRead', UsersControllerV2.markAllDirectsAsRead);
  app.post('/users/markAllNotificationsAsRead', UsersControllerV2.markAllNotificationsAsRead);
  app.get('/users/whoami', UsersControllerV2.whoAmI);
  app.get('/users/sparseMatches', UsersControllerV2.sparseMatches);
  app.post('/users/verifyEmail', UsersControllerV2.verifyEmail);
  app.get('/users/:username/statistics', UsersControllerV2.statistics);
}
