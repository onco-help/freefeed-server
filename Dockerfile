FROM node:20-bookworm

RUN apt-get update && \
    apt-get install -y \
    graphicsmagick \
    g++ \
    git \
    make

WORKDIR /server
ADD ./.yarn /server/.yarn
ADD ./.yarnrc.yml /server/.yarnrc.yml
ADD ./.eslint* /server/
ADD ./yarn.lock /server/yarn.lock
ADD ./package.json /server/package.json
ADD ./.nvmrc /server/.nvmrc
ADD ./.mocharc.json /server/.mocharc.json
ADD ./knexfile.js /server/knexfile.js
ADD ./tsconfig.json /server/tsconfig.json
ADD ./esm /server/esm
ADD ./types /server/types

RUN rm -rf node_modules && \
    rm -f log/*.log && \
    mkdir -p ./public/files/attachments/thumbnails && \
    mkdir -p ./public/files/attachments/thumbnails2 && \
    yarn install

ENV NODE_ENV production

ADD . /server

CMD ["sh","run.sh"]
