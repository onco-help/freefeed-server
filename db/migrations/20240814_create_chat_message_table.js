exports.up = function(knex) {
  return knex.schema.createTable('chat_messages', function(table) {
    table.increments('id').primary();
    table.uuid('chat').references('uuid').inTable('chats').onDelete('CASCADE');
    table.timestamp('timestamp').notNullable();
    table.text('message').notNullable();
    table.string('author').notNullable();
    table.string('controls').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('chat_messages');
};
