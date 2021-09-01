FROM node:14.15.4-alpine AS builder

WORKDIR /usr/src/app
COPY package*.json .
COPY yarn.lock .

RUN apk add python build-base
RUN yarn
COPY . .
RUN yarn build

FROM node:14.15.4-alpine

RUN apk add python build-base
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules node_modules
COPY --from=builder /usr/src/app/dist dist
COPY --from=builder /usr/src/app/package.json ./

ENTRYPOINT yarn start