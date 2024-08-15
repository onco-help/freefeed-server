exports.up = function(knex) {
  return knex.schema.createTable('chats', function(table) {
    table.uuid('uuid').primary();
    table.string('user').notNullable();
    table.string('type').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('chats');
};
