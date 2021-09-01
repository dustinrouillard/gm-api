import { PortConfig } from './config';

import 'isomorphic-fetch';
import fastify, { FastifyRequest } from 'fastify';
import fastifyCors from 'fastify-cors';
import { pack } from 'erlpack';

import { Debug, Log, SetConfig } from '@dustinrouillard/fastify-utilities/modules/logger';
SetConfig({ disableTimestamp: true, logColor: 'blueBright' });

import { Success, Failed } from '@dustinrouillard/fastify-utilities/modules/response';
import { Logger, Missing } from '@dustinrouillard/fastify-utilities/modules/request';
import { PostgresClient } from '@dustinrouillard/database-connectors/postgres';
import { RedisClient } from '@dustinrouillard/database-connectors/redis';

import { getPosts } from './utils/api';
import { RabbitChannel } from './connectivity/rabbitmq';

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

  Log('Starting listen task for new gm\'s ;)');
  setInterval(async () => {
    const posts = await getPosts();

    for await (const post of posts) {
      const id = Buffer.from(`${post.createdAt}:${post.creator.uid}`).toString('base64');
      const db = await PostgresClient.oneOrNone('SELECT id FROM posts WHERE id = $1;', [id]);
      if (db) continue;

      const user = await PostgresClient.oneOrNone('SELECT id, score FROM users WHERE id = $1;', [post.creator.uid]);
      if (!user) await PostgresClient.none('INSERT INTO users (id, score, username, name, bio, avatar) VALUES ($1, $2, $3, $4, $5, $6);', [
        post.creator.uid,
        post.creator.gmScore + 1,
        post.creator.username,
        post.creator.name,
        post.creator.bio,
        post.creator.avatarUrl
      ]);

      if (user && user.score != post.creator.gmScore) await PostgresClient.none('UPDATE users SET score = $2 WHERE id = $1;', [post.creator.uid, post.creator.gmScore + 1]);

      await PostgresClient.none(`INSERT INTO posts (id, creation_time, type, creator) VALUES ($1, $2, $3, $4)`, [id, new Date(post.createdAt * 1000), post.type, post.creator.uid]);

      Debug(`New ${post.type.toLowerCase()} from ${post.creator.name} @${post.creator.username}`);
      RabbitChannel.sendToQueue('dstn-gm-gateway-ingest', pack({
        t: 1, d: {
          post: {
            id,
            creation_time: new Date(post.createdAt * 1000),
            type: post.type,
            creator: post.creator.uid
          }, user: {
            id: post.creator.uid,
            score: post.creator.gmScore + 1,
            username: post.creator.username,
            name: post.creator.name,
            bio: post.creator.bio,
            avatar: post.creator.avatarUrl
          }
        }
      }));
      await fetch('https://canary.discord.com/api/webhooks/882166636403118140/vJ85vraCHWHysiSQMt25MoQFo0t7Y_NDSV3oyNT_icBAdqTP4jpWXcPrZrWoJtCbftEz', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: post.type.toLowerCase(),
            description: `${post.creator.name} currently has ${(post.creator.gmScore + 1).toLocaleString()
              } score`,
            author: { name: `${post.creator.name} @${post.creator.username} `, icon_url: post.creator.avatarUrl },
            timestamp: new Date(post.createdAt * 1000).toISOString(),
            footer: { text: 'gm watcher • dstn.to' }
          }]
        })
      })

      const cachedTop = JSON.parse(await RedisClient.get('users/top') || '[]');
      const hasUser = cachedTop.find((user: { id: string; score: number }) => user.id == post.creator.uid);
      if (hasUser) {
        // User has new score, we need to update the top and push lb update to queue
        hasUser.score = post.creator.gmScore + 1;
        await RedisClient.set('users/top', JSON.stringify(cachedTop));
        RabbitChannel.sendToQueue('dstn-gm-gateway-ingest', pack({ t: 0, d: { leaderboard: cachedTop } }));
      }
    }
  }, 1000);

  async function call() {
    const last_top = JSON.parse(await RedisClient.get('users/top') || '[]');
    const users = await PostgresClient.manyOrNone('SELECT id, score, username, name, bio, avatar FROM users ORDER BY score DESC LIMIT 10;');
    if (JSON.stringify(users) == JSON.stringify(last_top)) return;
    await RedisClient.set('users/top', JSON.stringify(users));

    RabbitChannel.sendToQueue('dstn-gm-gateway-ingest', pack({ t: 0, d: { leaderboard: users } }));
  }

  setInterval(async () => {
    call()
  }, 10000);
});

