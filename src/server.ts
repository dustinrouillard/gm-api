import { DisableTask, PortConfig } from './config';

import 'isomorphic-fetch';
import fastify, { FastifyRequest } from 'fastify';
import fastifyCors from 'fastify-cors';

import { Log, SetConfig } from '@dustinrouillard/fastify-utilities/modules/logger';
SetConfig({ disableTimestamp: true, logColor: 'blueBright' });

import { Success } from '@dustinrouillard/fastify-utilities/modules/response';
import { Logger, Missing } from '@dustinrouillard/fastify-utilities/modules/request';
import { PostgresClient } from '@dustinrouillard/database-connectors/postgres';
import { getLb } from './utils/api';

const server = fastify();

server.register(fastifyCors);

// Register request logger
server.register(Logger());

// Routes
server.get('/top', async (req: FastifyRequest, reply) => {
  const users = await PostgresClient.manyOrNone('SELECT users.id, score, username, name, bio, avatar, rank FROM users LEFT JOIN ranks ON users.id = ranks.id WHERE users.hidden IS FALSE ORDER BY rank ASC LIMIT 100;');

  return Success(reply, 200, users);
});

server.get('/top/official', async (req: FastifyRequest, reply) => {
  const lb = await getLb();

  return Success(reply, 200, lb);
});


server.get('/recents', async (req: FastifyRequest, reply) => {
  const posts = await PostgresClient.manyOrNone(`
    SELECT
      p.id,
        p.creation_time,
        p.type,
        p.text,
        json_build_object('id', u.id, 'name', u.name, 'username', u.username, 'score', u.score, 'avatar', u.avatar, 'bio', u.bio, 'rank', r.rank) as creator
    FROM
      posts p
      LEFT JOIN users u ON u.id = p.creator
      LEFT JOIN ranks r ON u.id = r.id
    ORDER BY
      creation_time DESC
    LIMIT 50;
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
    // import('./utils/task');
  }
});
