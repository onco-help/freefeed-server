import type { Knex } from 'knex';

export const up = function (knex: Knex) {
  knex.schema.raw(`do $$begin

  end$$`);
};

export const down = function (knex: Knex) {
  knex.schema.raw(`do $$begin

  end$$`);
};
