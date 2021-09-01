import { DisableTask, PortConfig } from './config';

import 'isomorphic-fetch';
import fastify, { FastifyRequest } from 'fastify';
import fastifyCors from 'fastify-cors';

import { Log, SetConfig } from '@dustinrouillard/fastify-utilities/modules/logger';
SetConfig({ disableTimestamp: true, logColor: 'blueBright' });

import { Success, Failed } from '@dustinrouillard/fastify-utilities/modules/response';
import { Logger, Missing } from '@dustinrouillard/fastify-utilities/modules/request';
import { PostgresClient } from '@dustinrouillard/database-connectors/postgres';

const server = fastify();

server.register(fastifyCors);

// Register request logger
server.register(Logger());

// Routes
server.get('/username/:username', async (req: FastifyRequest<{ Params: { username: string } }>, reply) => {
  const user = await PostgresClient.oneOrNone('SELECT id, score, username, name, bio, avatar FROM users WHERE username = $1;', [req.params.username]);
  if (!user) return Failed(reply, 404, 'user_not_found');

  const lastPost = await PostgresClient.oneOrNone('SELECT id, creation_time, type, creator FROM posts WHERE creator = $1 ORDER BY creation_time DESC LIMIT 1;', [user.id])

  return Success(reply, 200, { user, last_post: lastPost });
});

server.get('/top', async (req: FastifyRequest<{ Params: { username: string } }>, reply) => {
  const users = await PostgresClient.manyOrNone('SELECT id, score, username, name, bio, avatar FROM users ORDER BY score DESC LIMIT 10;');
  if (!users) return Failed(reply, 404, 'user_not_found');

  return Success(reply, 200, users);
});

server.register(Missing);

server.listen(PortConfig, '0.0.0.0', async () => {
  Log(`Server ready on ${PortConfig}`);

  if (!DisableTask) {
    Log('Starting listen task for new gm\'s ;)');
    import('./utils/task');
  }
});

