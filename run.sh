#!/bin/sh

yarn knex --env production migrate:latest
yarn start