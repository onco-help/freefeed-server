import type { Knex } from 'knex';

export const up = function (knex: Knex) {
  knex.schema.raw(`do $$begin

  alter table users add column has_cancer boolean not null default false;

  end$$`);
};

export const down = function (knex: Knex) {
  knex.schema.raw(`do $$begin

  alter table users drop column has_cancer;

  end$$`);
};
