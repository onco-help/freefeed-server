/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  knex.schema.raw(`do $$begin

  alter table users add column has_cancer boolean not null default false;

  end$$`);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  knex.schema.raw(`do $$begin

  alter table users drop column has_cancer;

  end$$`);
};
