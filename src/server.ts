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
  const user = await PostgresClient.oneOrNone('SELECT users.id, score, username, name, bio, avatar, rank FROM users LEFT JOIN ranks ON users.id = ranks.id WHERE username = $1 ORDER BY score DESC LIMIT 1;', [
    req.params.username
  ]);
  if (!user) return Failed(reply, 404, 'user_not_found');

  const lastPost = await PostgresClient.oneOrNone('SELECT id, creation_time, type, creator FROM posts WHERE creator = $1 ORDER BY creation_time DESC LIMIT 1;', [user.id]);

  return Success(reply, 200, { user, last_post: lastPost });
});

server.get('/search', async (req: FastifyRequest<{ Querystring: { query: string } }>, reply) => {
  const results = await PostgresClient.manyOrNone(
    "SELECT users.id, score, username, name, bio, avatar, rank FROM users LEFT JOIN ranks ON users.id = ranks.id WHERE username = $1 OR username LIKE CONCAT($1, '%') ORDER BY score DESC LIMIT 25;",
    [req.query.query]
  );
  if (!results) return Failed(reply, 404, 'query_not_found');

  return Success(reply, 200, { results });
});

server.get('/top', async (req: FastifyRequest, reply) => {
  const users = await PostgresClient.manyOrNone('SELECT users.id, score, username, name, bio, avatar, rank FROM users LEFT JOIN ranks ON users.id = ranks.id WHERE rank <= 10 ORDER BY rank ASC LIMIT 10;');

  return Success(reply, 200, users);
});

server.get('/recents', async (req: FastifyRequest, reply) => {
  const posts = await PostgresClient.manyOrNone(`
    SELECT
      p.id,
        p.creation_time,
        p.type,
        json_build_object('id', u.id, 'name', u.name, 'username', u.username, 'score', u.score, 'avatar', u.avatar, 'bio', u.bio) as creator
    FROM
      posts p
      LEFT JOIN users u ON u.id = p.creator
    ORDER BY
      creation_time DESC
    LIMIT 10;
  `);

  return Success(reply, 200, posts);
});

server.get('/health', (_req, reply) => {
  reply.status(204).send();
});

server.register(Missing);

server.listen(PortConfig, '0.0.0.0', async () => {
  Log(`Server ready on ${PortConfig}`);

  if (!DisableTask) {
    Log("Starting listen task for new gm's ;)");
    import('./utils/task');
  }
});
