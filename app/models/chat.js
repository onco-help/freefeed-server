import { v4 as uuidv4 } from 'uuid';

export class Chat {
  constructor(user, type) {
    this.user = user;
    this.uuid = uuidv4();
    this.type = type;
  }
}
